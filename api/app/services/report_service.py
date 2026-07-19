from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from html import escape
import json
from io import BytesIO
from pathlib import Path
from typing import Any

import httpx
from pydantic import ValidationError
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image, KeepTogether, LongTable, PageBreak, Paragraph, SimpleDocTemplate,
    Spacer, Table, TableStyle,
)

from ..config import Settings, get_settings
from ..db.exports import ExportRepository
from ..domain.reports import EventNarrative, EventReportStats, RunSummary, UnitSummary


REPORT_SYSTEM_PROMPT = """You are creating an administrative after-action summary for the
Miami Beach Fire Department.

Use only the supplied structured event data.
Do not invent incidents, units, times, counts, outcomes, destinations,
or operational actions.
Do not recalculate statistics.
Do not state that an event was successful or unsuccessful unless the
source data explicitly supports that conclusion.
Keep the tone factual, concise, and professional."""

_qwen_semaphore = asyncio.Semaphore(1)


def _parse(value: str | None) -> datetime | None:
    if not value:
        return None
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return result if result.tzinfo else result.replace(tzinfo=timezone.utc)


def _minutes(start: datetime | None, end: datetime | None) -> float:
    if not start or not end:
        return 0.0
    return max(0.0, (end - start).total_seconds() / 60)


def _rounded(value: float) -> float:
    return round(value, 2)


def _safe(value: Any) -> str:
    return escape(str(value or "—"), quote=True)


class ReportService:
    def __init__(self, path: str | None = None, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self.repository = ExportRepository(path or self.settings.db_path)

    async def build_stats(self, incident_id: str, *, now: datetime | None = None) -> EventReportStats:
        rows = await asyncio.to_thread(self.repository.report_rows, incident_id)
        if not rows:
            raise KeyError(incident_id)
        return self._calculate(rows, now=now or datetime.now(timezone.utc))

    def _calculate(self, rows: dict, *, now: datetime) -> EventReportStats:
        incident = rows["incident"]
        started = _parse(incident.get("actual_start_at") or incident.get("scheduled_start_at") or incident.get("created_at"))
        ended = _parse(incident.get("actual_end_at"))
        event_calc_end = ended or now
        warnings: list[str] = []
        if not incident.get("actual_start_at"):
            warnings.append("Actual event start was not recorded; the scheduled or created time was used.")
        if not ended:
            warnings.append("Event end was not recorded; active durations use the report generation time.")

        assignments_by_run: dict[str, list[dict]] = defaultdict(list)
        for assignment in rows["assignments"]:
            assignments_by_run[assignment["run_id"]].append(assignment)

        run_summaries: list[RunSummary] = []
        unit_totals: dict[str, dict[str, float | int]] = defaultdict(
            lambda: {"runs": 0, "minutes": 0.0, "transports": 0, "refusals": 0}
        )
        disposition_counts = {"transport": 0, "refusal": 0, "no_patient": 0}
        total_unit_minutes = 0.0
        total_assignments = 0

        for run in rows["runs"]:
            assignments = assignments_by_run.get(run["id"], [])
            starts = sorted(filter(None, (_parse(item.get("assigned_at")) for item in assignments)))
            run_start = _parse(run.get("activated_at")) or (starts[0] if starts else None) or _parse(run.get("received_at"))
            run_end = _parse(run.get("cleared_at")) or event_calc_end
            run_minutes = _minutes(run_start, run_end)
            dispositions: list[str] = []
            for item in assignments:
                assigned = _parse(item.get("assigned_at"))
                cleared = _parse(item.get("cleared_at")) or event_calc_end
                active_minutes = _minutes(assigned, cleared)
                unit_id = item["unit_id"]
                total_unit_minutes += active_minutes
                total_assignments += 1
                unit_totals[unit_id]["runs"] += 1
                unit_totals[unit_id]["minutes"] += active_minutes
                disposition = item.get("disposition")
                if disposition:
                    dispositions.append(disposition)
                    if disposition in disposition_counts:
                        disposition_counts[disposition] += 1
                    if disposition == "transport": unit_totals[unit_id]["transports"] += 1
                    if disposition == "refusal": unit_totals[unit_id]["refusals"] += 1
                elif run["category"] == "medical":
                    warnings.append(f"Run {run['id']} has a medical assignment for {unit_id} without a disposition.")
            if not assignments:
                warnings.append(f"Run {run['id']} has no unit assignment.")
            if not run.get("cleared_at"):
                warnings.append(f"Run {run['id']} was active when this report was generated.")
            run_summaries.append(RunSummary(
                run_id=run["id"], incident_number=run.get("incident_number") or "",
                received_at=_parse(run.get("received_at")) or now, cleared_at=_parse(run.get("cleared_at")),
                category=run["category"], subtype=run["subtype"], call_type=run["call_type_label"],
                address=run.get("address") or "", source=run["source"],
                units=[item["unit_id"] for item in assignments], duration_minutes=_rounded(run_minutes),
                dispositions=dispositions,
            ))

        unit_summaries = [UnitSummary(
            unit_id=unit_id, runs=int(values["runs"]), active_minutes=_rounded(float(values["minutes"])),
            transports=int(values["transports"]), refusals=int(values["refusals"]),
        ) for unit_id, values in sorted(unit_totals.items())]
        total_run_minutes = sum(item.duration_minutes for item in run_summaries)
        longest = max(run_summaries, key=lambda item: item.duration_minutes, default=None)
        command_post_data = json.loads(incident["command_post_json"]) if incident.get("command_post_json") else {}
        command_post = " — ".join(filter(None, [command_post_data.get("label"), command_post_data.get("address")]))
        overrides = [
            f"{row['occurred_at']}: {row['event_type']} — {json.dumps(json.loads(row['payload_json']), sort_keys=True)}"
            for row in rows["overrides"]
        ]
        warnings = list(dict.fromkeys(warnings))
        return EventReportStats(
            incident_id=incident["id"], event_name=incident["name"], command_post=command_post,
            started_at=started, ended_at=ended, total_duration_minutes=_rounded(_minutes(started, event_calc_end)),
            participating_units=[item.unit_id for item in unit_summaries], total_runs=len(run_summaries),
            medical_runs=sum(item.category == "medical" for item in run_summaries),
            fire_runs=sum(item.category == "fire" for item in run_summaries),
            other_runs=sum(item.category == "other" for item in run_summaries),
            rescue_runs=sum(item.subtype == "rescue" for item in run_summaries),
            vehicle_runs=sum(item.subtype == "vehicle" for item in run_summaries),
            hazmat_runs=sum(item.subtype == "hazmat" for item in run_summaries),
            pulsepoint_runs=sum(item.source == "pulsepoint" for item in run_summaries),
            manual_runs=sum(item.source == "manual" for item in run_summaries),
            total_unit_assignments=total_assignments, transports=disposition_counts["transport"],
            refusals=disposition_counts["refusal"], no_patient=disposition_counts["no_patient"],
            total_run_minutes=_rounded(total_run_minutes), total_unit_call_minutes=_rounded(total_unit_minutes),
            average_run_minutes=_rounded(total_run_minutes / len(run_summaries) if run_summaries else 0),
            longest_run_minutes=longest.duration_minutes if longest else 0,
            longest_run_id=longest.run_id if longest else None, manual_overrides=overrides,
            units=unit_summaries, runs=run_summaries, data_quality_notes=warnings,
        )

    async def build_narrative(self, stats: EventReportStats, client: httpx.AsyncClient) -> EventNarrative:
        payload = {
            "model": self.settings.ollama_model, "stream": False, "think": False,
            "format": EventNarrative.model_json_schema(),
            "options": {"temperature": 0, "num_predict": 900},
            "messages": [
                {"role": "system", "content": REPORT_SYSTEM_PROMPT},
                {"role": "user", "content": stats.model_dump_json()},
            ],
        }
        try:
            async with _qwen_semaphore:
                response = await client.post(
                    f"{self.settings.ollama_url}/api/chat", json=payload,
                    timeout=self.settings.parse_timeout_s,
                )
            response.raise_for_status()
            content = response.json().get("message", {}).get("content", "")
            return EventNarrative.model_validate_json(content)
        except (httpx.HTTPError, ValidationError, json.JSONDecodeError, KeyError, ValueError, TypeError):
            note = "AI narrative generation was unavailable; deterministic fallback text was used."
            if note not in stats.data_quality_notes:
                stats.data_quality_notes.append(note)
            return EventNarrative(
                executive_summary=f"{stats.event_name} recorded {stats.total_runs} run(s) involving {len(stats.participating_units)} participating unit(s).",
                operational_overview="This summary reflects the logged event, run, assignment, and disposition records available at export time.",
                notable_activity=[], data_quality_notes=[note],
            )

    def render_pdf(self, stats: EventReportStats, narrative: EventNarrative) -> bytes:
        output = BytesIO()
        doc = SimpleDocTemplate(output, pagesize=letter, rightMargin=36, leftMargin=36,
                                topMargin=42, bottomMargin=50, title=stats.event_name,
                                author="MBFD Command")
        styles = getSampleStyleSheet()
        title = ParagraphStyle("ReportTitle", parent=styles["Title"], fontName="Helvetica-Bold",
                               fontSize=23, leading=27, textColor=colors.HexColor("#10243e"), alignment=TA_LEFT)
        heading = ParagraphStyle("Section", parent=styles["Heading2"], fontName="Helvetica-Bold",
                                 fontSize=13, leading=16, textColor=colors.HexColor("#d94135"), spaceBefore=10, spaceAfter=7)
        body = ParagraphStyle("Body", parent=styles["BodyText"], fontSize=9, leading=13,
                              textColor=colors.HexColor("#26384f"))
        small = ParagraphStyle("Small", parent=body, fontSize=7.2, leading=9)
        story: list[Any] = []
        logo = (self.settings.static_path / "mbfd-logo.png") if self.settings.static_path else None
        header_cells: list[Any] = []
        if logo and logo.exists():
            header_cells.append(Image(str(logo), width=.72 * inch, height=.72 * inch))
        header_cells.append(Paragraph(f"<b>MIAMI BEACH FIRE DEPARTMENT</b><br/><font size='9'>MBFD Command — Event Summary</font>", body))
        story.append(Table([header_cells], colWidths=[.85 * inch, 6.0 * inch] if len(header_cells) == 2 else [6.85 * inch]))
        story.append(Spacer(1, 12))
        story.append(Paragraph(_safe(stats.event_name), title))
        event_date = stats.started_at.strftime("%B %d, %Y") if stats.started_at else "Date unavailable"
        story.append(Paragraph(f"{_safe(event_date)} · Command post: {_safe(stats.command_post)}", body))
        story.append(Spacer(1, 12))
        timing = [["START", "END", "EVENT DURATION", "RUN TIME SUM", "UNIT CALL HOURS"], [
            self._fmt_dt(stats.started_at), self._fmt_dt(stats.ended_at), self._fmt_minutes(stats.total_duration_minutes),
            self._fmt_minutes(stats.total_run_minutes), f"{stats.total_unit_call_minutes / 60:.2f} hr",
        ]]
        story.append(self._table(timing, [1.25 * inch, 1.25 * inch, 1.35 * inch, 1.35 * inch, 1.45 * inch], header=True))
        story.append(Spacer(1, 12))
        kpis = [["TOTAL RUNS", "MEDICAL", "FIRE", "OTHER", "TRANSPORTS", "REFUSALS"], [
            stats.total_runs, stats.medical_runs, stats.fire_runs, stats.other_runs, stats.transports, stats.refusals,
        ]]
        story.append(self._table(kpis, [1.1 * inch] * 6, header=True, accent=True))
        story.append(Spacer(1, 10))
        story.append(Paragraph("Source and subtype breakdown", heading))
        story.append(Paragraph(
            f"PulsePoint: <b>{stats.pulsepoint_runs}</b> · Manual: <b>{stats.manual_runs}</b> · "
            f"Rescue: <b>{stats.rescue_runs}</b> · Vehicle: <b>{stats.vehicle_runs}</b> · Hazmat: <b>{stats.hazmat_runs}</b> · "
            f"No-patient outcomes: <b>{stats.no_patient}</b>", body))
        story.append(PageBreak())
        story.append(Paragraph("Executive summary", heading))
        story.append(Paragraph(_safe(narrative.executive_summary), body))
        story.append(Paragraph("Operational overview", heading))
        story.append(Paragraph(_safe(narrative.operational_overview), body))
        if narrative.notable_activity:
            story.append(Paragraph("Notable activity", heading))
            for item in narrative.notable_activity:
                story.append(Paragraph(f"• {_safe(item)}", body))
        story.append(Paragraph("Participating units", heading))
        story.append(Paragraph(_safe(", ".join(stats.participating_units) or "No participating units recorded"), body))
        unit_rows: list[list[Any]] = [["UNIT", "RUNS", "CALL MINUTES", "TRANSPORTS", "REFUSALS"]]
        unit_rows += [[_safe(item.unit_id), item.runs, f"{item.active_minutes:.1f}", item.transports, item.refusals] for item in stats.units]
        story.append(self._table(unit_rows, [1.35 * inch, .8 * inch, 1.2 * inch, 1.1 * inch, 1.0 * inch], header=True))
        story.append(PageBreak())
        story.append(Paragraph("Complete run log", heading))
        run_rows: list[list[Any]] = [["RECEIVED", "INCIDENT / TYPE", "ADDRESS", "UNITS", "MIN", "OUTCOMES"]]
        for item in stats.runs:
            run_rows.append([
                item.received_at.strftime("%m/%d %H:%M"),
                Paragraph(f"<b>{_safe(item.incident_number or item.run_id)}</b><br/>{_safe(item.call_type)}<br/>{_safe(item.category)} / {_safe(item.subtype)}", small),
                Paragraph(_safe(item.address), small), Paragraph(_safe(", ".join(item.units) or "Unassigned"), small),
                f"{item.duration_minutes:.1f}", Paragraph(_safe(", ".join(item.dispositions) or "—"), small),
            ])
        story.append(LongTable(run_rows, colWidths=[.75 * inch, 1.45 * inch, 1.45 * inch, 1.0 * inch, .45 * inch, 1.25 * inch],
                               repeatRows=1, style=self._table_style(header=True)))
        story.append(Paragraph("Disposition and duration summary", heading))
        longest = f"{stats.longest_run_id} ({stats.longest_run_minutes:.1f} min)" if stats.longest_run_id else "No runs"
        story.append(Paragraph(
            f"Transports: <b>{stats.transports}</b> · Refusals: <b>{stats.refusals}</b> · No patient: <b>{stats.no_patient}</b><br/>"
            f"Average run: <b>{stats.average_run_minutes:.1f} min</b> · Longest run: <b>{_safe(longest)}</b>", body))
        story.append(Paragraph("Manual overrides", heading))
        for item in stats.manual_overrides or ["No operator overrides were recorded."]:
            story.append(Paragraph(f"• {_safe(item)}", small))
        story.append(Paragraph("Data-quality notes", heading))
        notes = list(dict.fromkeys([*stats.data_quality_notes, *narrative.data_quality_notes]))
        for item in notes or ["No data-quality warnings were identified."]:
            story.append(Paragraph(f"• {_safe(item)}", body))
        doc.build(story, onFirstPage=self._footer, onLaterPages=self._footer)
        return output.getvalue()

    @staticmethod
    def _table(rows: list[list[Any]], widths: list[float], *, header: bool, accent: bool = False) -> Table:
        table = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
        table.setStyle(ReportService._table_style(header=header, accent=accent))
        return table

    @staticmethod
    def _table_style(*, header: bool, accent: bool = False) -> TableStyle:
        commands = [
            ("GRID", (0, 0), (-1, -1), .35, colors.HexColor("#cbd5e1")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 7.5),
            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]),
        ]
        if header:
            commands += [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#d94135") if accent else colors.HexColor("#10243e")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ]
        return TableStyle(commands)

    @staticmethod
    def _fmt_dt(value: datetime | None) -> str:
        return value.strftime("%m/%d/%Y %H:%M") if value else "Not recorded"

    @staticmethod
    def _fmt_minutes(value: float) -> str:
        hours, minutes = divmod(round(value), 60)
        return f"{hours}h {minutes:02d}m"

    @staticmethod
    def _footer(canvas: Any, doc: Any) -> None:
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#cbd5e1")); canvas.line(36, 36, letter[0] - 36, 36)
        canvas.setFillColor(colors.HexColor("#64748b")); canvas.setFont("Helvetica", 6.8)
        canvas.drawString(36, 24, "MBFD Command — Generated locally · Statistics are calculated from logged event records.")
        canvas.drawRightString(letter[0] - 36, 24, f"Page {doc.page}")
        canvas.drawString(36, 14, "AI-assisted narrative is administrative decision support and should be reviewed.")
        canvas.restoreState()
