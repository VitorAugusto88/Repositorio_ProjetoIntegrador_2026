from datetime import date, datetime
from io import BytesIO
from xml.sax.saxutils import escape

from django.http import FileResponse
from django.utils import timezone


PDF_CONTENT_TYPE = 'application/pdf'
EXCEL_CONTENT_TYPE = (
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
)

# Rótulos em português para os campos do resumo. Sem isso, os relatórios
# exibiriam as chaves cruas em inglês (ex.: "Total Appointments").
SUMMARY_LABELS = {
    'total_appointments': 'Total de consultas',
    'scheduled': 'Agendadas',
    'completed': 'Realizadas',
    'cancelled': 'Canceladas',
    'rescheduled': 'Remarcadas',
    'no_show': 'Faltas',
    'unique_patients': 'Pacientes únicos',
    'patients_attended': 'Pacientes atendidos',
    'attendance_rate_percent': 'Taxa de comparecimento',
    'cancellation_rate_percent': 'Taxa de cancelamento',
    'first_appointment_at': 'Primeira consulta',
    'last_appointment_at': 'Última consulta',
}


def _summary_label(key):
    return SUMMARY_LABELS.get(key, _humanize(key))


def _format_value(key, value):
    """Formata um valor para exibição, ciente do significado da coluna."""
    key = str(key)
    if key.endswith('_percent'):
        return '{}%'.format(_value_to_text(value))
    if key.endswith('_at') and isinstance(value, str) and value:
        return _format_iso_datetime(value)
    return _value_to_text(value)


def _format_iso_datetime(value):
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return _value_to_text(value)
    if timezone.is_aware(parsed):
        parsed = timezone.localtime(parsed)
    return parsed.strftime('%d/%m/%Y %H:%M')


def build_pdf_response(title, filename, summary, sections):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import (
        Paragraph,
        SimpleDocTemplate,
        Spacer,
    )

    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        rightMargin=28,
        leftMargin=28,
        topMargin=28,
        bottomMargin=28,
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph(escape(title), styles['Title']),
        Paragraph(
            'Gerado em {}'.format(
                timezone.localtime(timezone.now()).strftime('%d/%m/%Y às %H:%M')
            ),
            styles['Normal'],
        ),
        Spacer(1, 12),
    ]

    if summary:
        story.append(Paragraph('Resumo', styles['Heading2']))
        story.append(_table_from_pairs(summary, styles))
        story.append(Spacer(1, 12))

    for section in sections:
        story.append(Paragraph(escape(section['title']), styles['Heading2']))
        rows = section.get('rows') or []
        columns = section.get('columns') or []
        if rows:
            story.append(_table_from_rows(rows, columns, styles))
        else:
            story.append(Paragraph('Sem dados para exibir.', styles['Normal']))
        story.append(Spacer(1, 12))

    document.build(story)
    buffer.seek(0)
    return FileResponse(
        buffer,
        as_attachment=True,
        filename=filename,
        content_type=PDF_CONTENT_TYPE,
    )


def build_excel_response(filename, summary, sheets):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter

    workbook = Workbook()
    summary_sheet = workbook.active
    summary_sheet.title = 'Resumo'
    summary_sheet.append(['Indicador', 'Valor'])
    _style_header(summary_sheet[1], Font, PatternFill)

    for key, value in summary.items():
        summary_sheet.append([_summary_label(key), _format_value(key, value)])

    _autosize(summary_sheet, get_column_letter)

    for sheet in sheets:
        worksheet = workbook.create_sheet(title=_safe_sheet_title(sheet['title']))
        columns = sheet.get('columns') or []
        rows = sheet.get('rows') or []
        worksheet.append([label for _, label in columns])
        _style_header(worksheet[1], Font, PatternFill)

        for row in rows:
            worksheet.append([
                _format_value(key, row.get(key))
                for key, _ in columns
            ])

        worksheet.freeze_panes = 'A2'
        _autosize(worksheet, get_column_letter)

    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return FileResponse(
        buffer,
        as_attachment=True,
        filename=filename,
        content_type=EXCEL_CONTENT_TYPE,
    )


def _table_from_pairs(mapping, styles):
    from reportlab.platypus import Paragraph

    rows = [['Indicador', 'Valor']]
    rows.extend([
        [
            Paragraph(escape(_summary_label(key)), styles['BodyText']),
            Paragraph(escape(_format_value(key, value)), styles['BodyText']),
        ]
        for key, value in mapping.items()
    ])
    return _styled_table(rows)


def _table_from_rows(rows, columns, styles):
    from reportlab.platypus import Paragraph

    table_rows = [[label for _, label in columns]]
    for row in rows:
        table_rows.append([
            Paragraph(escape(_format_value(key, row.get(key))), styles['BodyText'])
            for key, _ in columns
        ])
    return _styled_table(table_rows)


def _styled_table(rows):
    from reportlab.lib import colors
    from reportlab.platypus import Table, TableStyle

    table = Table(rows, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#E9EEF5')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#111827')),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#CBD5E1')),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [
            colors.white,
            colors.HexColor('#F8FAFC'),
        ]),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return table


def _style_header(row, font_cls, fill_cls):
    for cell in row:
        cell.font = font_cls(bold=True)
        cell.fill = fill_cls(
            fill_type='solid',
            fgColor='E9EEF5',
        )


def _autosize(worksheet, get_column_letter):
    for column in worksheet.columns:
        max_length = 0
        column_letter = get_column_letter(column[0].column)
        for cell in column:
            max_length = max(max_length, len(_value_to_text(cell.value)))
        worksheet.column_dimensions[column_letter].width = min(max_length + 2, 48)


def _safe_sheet_title(value):
    invalid_chars = '[]:*?/\\'
    title = ''.join('_' if char in invalid_chars else char for char in value)
    return title[:31] or 'Relatorio'


def _humanize(value):
    return str(value).replace('_', ' ').title()


def _value_to_text(value):
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'Sim' if value else 'Não'
    if isinstance(value, datetime):
        if timezone.is_aware(value):
            value = timezone.localtime(value)
        return value.strftime('%d/%m/%Y %H:%M')
    if isinstance(value, date):
        return value.strftime('%d/%m/%Y')
    text = str(value).replace('\r', ' ').replace('\n', ' ').strip()
    if len(text) > 300:
        return text[:297] + '...'
    return text
