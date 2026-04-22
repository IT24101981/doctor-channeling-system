const { google } = require('googleapis');

/** Default spreadsheet (share with service account as Editor). */
const DEFAULT_SPREADSHEET_ID = '18tdec0cVkYdL6nGC3b-YmduAm6qV68vg_rs3_p7ASLg';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getSpreadsheetId() {
    return String(process.env.GOOGLE_SHEETS_PAYMENT_ARCHIVE_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID).trim();
}

function getPaymentTabName() {
    return String(process.env.GOOGLE_SHEETS_PAYMENT_ARCHIVE_TAB || 'Sheet1').trim() || 'Sheet1';
}

/** Same workbook as payments unless GOOGLE_SHEETS_REFUND_ARCHIVE_SPREADSHEET_ID is set. */
function getRefundSpreadsheetId() {
    const id = process.env.GOOGLE_SHEETS_REFUND_ARCHIVE_SPREADSHEET_ID;
    return String(id != null && String(id).trim() !== '' ? id : getSpreadsheetId()).trim();
}

function getRefundTabName() {
    return String(process.env.GOOGLE_SHEETS_REFUND_ARCHIVE_TAB || 'Sheet2').trim() || 'Sheet2';
}

/** A1 notation range with optional quoting for sheet names (spaces, etc.). */
function sheetRange(tab, a1Suffix) {
    const t = String(tab).trim() || 'Sheet1';
    const needsQuote = /[^A-Za-z0-9_]/.test(t);
    const name = needsQuote ? `'${t.replace(/'/g, "''")}'` : t;
    return `${name}!${a1Suffix}`;
}

/** 1-based column index to Excel column letter(s). */
function columnIndexToLetter(indexOneBased) {
    let n = indexOneBased;
    let s = '';
    while (n > 0) {
        const rem = (n - 1) % 26;
        s = String.fromCharCode(65 + rem) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

function getClientEmail() {
    return String(process.env.GOOGLE_SHEETS_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
}

function getPrivateKey() {
    const raw = process.env.GOOGLE_SHEETS_PRIVATE_KEY || process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
    return String(raw).replace(/\\n/g, '\n').trim();
}

function isGoogleSheetsArchiveConfigured() {
    return Boolean(getClientEmail() && getPrivateKey());
}

function formatDateTimeLK(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    // Human-readable, stable format for non-technical users.
    // Example: "22 Apr 2026 14:28:24 (LK)"
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Colombo',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(d);
    return `${parts.replace(',', '')} (LK)`;
}

function formatCell(value) {
    if (value == null) return '';
    if (value instanceof Date) return formatDateTimeLK(value);
    if (typeof value === 'string') {
        const s = value.trim();
        // If it looks like an ISO string or MySQL datetime, make it human-readable in LK time.
        if (
            /^\d{4}-\d{2}-\d{2}T/.test(s) ||
            /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)
        ) {
            const formatted = formatDateTimeLK(s);
            return formatted || s;
        }
    }
    return String(value);
}

function rowToSheetArray(row, meta) {
    const amount = row.amount != null ? Number(row.amount).toFixed(2) : '';
    return [
        formatCell(meta.deletedAt),
        meta.deletedBy || '',
        row.id != null ? String(row.id) : '',
        row.internal_order_id != null ? String(row.internal_order_id) : '',
        row.patient_name != null ? String(row.patient_name) : '',
        row.doctor_name != null ? String(row.doctor_name) : '',
        amount,
        row.payment_method != null ? String(row.payment_method) : '',
        row.payment_status != null ? String(row.payment_status) : '',
        row.card_last_digits != null ? String(row.card_last_digits) : '',
        row.appointment_id != null ? String(row.appointment_id) : '',
        formatCell(row.created_at)
    ];
}

const PAYMENT_HEADER = [
    'Deleted At (UTC)',
    'Deleted By',
    'Payment ID',
    'Order ID',
    'Patient',
    'Doctor',
    'Amount (LKR)',
    'Method',
    'Status',
    'Card Last 4',
    'Appointment ID',
    'Payment Created At (UTC)'
];

function refundRowToSheetArray(row, meta) {
    const amount = row.amount != null ? Number(row.amount).toFixed(2) : '';
    return [
        formatCell(meta.deletedAt),
        meta.deletedBy || '',
        row.id != null ? String(row.id) : '',
        row.internal_order_id != null ? String(row.internal_order_id) : '',
        row.patient_name != null ? String(row.patient_name) : '',
        row.doctor_name != null ? String(row.doctor_name) : '',
        amount,
        row.status != null ? String(row.status) : '',
        row.appointment_id != null ? String(row.appointment_id) : '',
        formatCell(row.requested_at),
        formatCell(row.resolved_at),
        row.patient_phone != null ? String(row.patient_phone) : '',
        row.patient_email != null ? String(row.patient_email) : '',
        row.schedule_date != null ? formatCell(row.schedule_date) : '',
        row.start_time != null ? String(row.start_time) : ''
    ];
}

const REFUND_HEADER = [
    'Deleted At (UTC)',
    'Deleted By',
    'Refund Request ID',
    'Order ID',
    'Patient',
    'Doctor',
    'Amount (LKR)',
    'Refund Status',
    'Appointment ID',
    'Requested At (UTC)',
    'Resolved At (UTC)',
    'Patient Phone',
    'Patient Email',
    'Schedule Date',
    'Start Time'
];

async function appendRowsToGoogleSheetTab(spreadsheetId, tabName, headerColumns, dataRowArrays, logLabel) {
    const rangeA1 = sheetRange(tabName, 'A1');
    const lastCol = columnIndexToLetter(headerColumns.length);
    const rangeAppend = sheetRange(tabName, `A:${lastCol}`);

    const clientEmail = getClientEmail();
    const privateKey = getPrivateKey();

    const auth = new google.auth.JWT({
        email: clientEmail,
        key: privateKey,
        scopes: SCOPES
    });

    const sheets = google.sheets({ version: 'v4', auth });

    try {
        await auth.authorize();

        const firstCell = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: rangeA1
        });

        const hasHeader =
            firstCell.data.values &&
            firstCell.data.values.length > 0 &&
            String(firstCell.data.values[0][0] || '').trim() !== '';

        const values = hasHeader ? dataRowArrays : [headerColumns, ...dataRowArrays];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: rangeAppend,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values }
        });

        return { ok: true };
    } catch (err) {
        const msg = err?.message || String(err);
        console.error(`[${logLabel}] Append failed:`, msg);
        return { ok: false, error: msg };
    }
}

/**
 * Appends deleted payment rows to the configured Google Sheet tab (default Sheet1).
 * @returns {Promise<{ ok: boolean, skipped: boolean, error?: string }>}
 */
async function appendDeletedPaymentsToGoogleSheet(paymentRows, meta) {
    if (!isGoogleSheetsArchiveConfigured()) {
        console.warn(
            '[googleSheetsArchive] Skipping payments: set GOOGLE_SHEETS_CLIENT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY. Share the spreadsheet with that email as Editor.'
        );
        return { ok: true, skipped: true };
    }

    const deletedAt = meta.deletedAt instanceof Date ? meta.deletedAt : new Date();
    const dataRows = paymentRows.map((r) => rowToSheetArray(r, { ...meta, deletedAt }));
    const result = await appendRowsToGoogleSheetTab(
        getSpreadsheetId(),
        getPaymentTabName(),
        PAYMENT_HEADER,
        dataRows,
        'googleSheetsPaymentArchive'
    );

    return result.ok ? { ok: true, skipped: false } : { ok: false, skipped: false, error: result.error };
}

/**
 * Appends deleted refund request rows (default tab Sheet2, same spreadsheet as payments).
 * @returns {Promise<{ ok: boolean, skipped: boolean, error?: string }>}
 */
async function appendDeletedRefundsToGoogleSheet(refundRows, meta) {
    if (!isGoogleSheetsArchiveConfigured()) {
        console.warn(
            '[googleSheetsArchive] Skipping refunds: set GOOGLE_SHEETS_CLIENT_EMAIL and GOOGLE_SHEETS_PRIVATE_KEY.'
        );
        return { ok: true, skipped: true };
    }

    const deletedAt = meta.deletedAt instanceof Date ? meta.deletedAt : new Date();
    const dataRows = refundRows.map((r) => refundRowToSheetArray(r, { ...meta, deletedAt }));
    const result = await appendRowsToGoogleSheetTab(
        getRefundSpreadsheetId(),
        getRefundTabName(),
        REFUND_HEADER,
        dataRows,
        'googleSheetsRefundArchive'
    );

    return result.ok ? { ok: true, skipped: false } : { ok: false, skipped: false, error: result.error };
}

module.exports = {
    appendDeletedPaymentsToGoogleSheet,
    appendDeletedRefundsToGoogleSheet,
    isGoogleSheetsArchiveConfigured
};
