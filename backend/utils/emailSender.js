'use strict';

const nodemailer = require('nodemailer');
const axios = require('axios');

let transporter;

function getTransporter() {
    if (transporter !== undefined) return transporter;
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
        transporter = null;
        return null;
    }
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
    const forceIpv4 = String(process.env.SMTP_FORCE_IPV4 || '').toLowerCase() === 'true';
    transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        ...(forceIpv4 ? { family: 4 } : {})
    });
    return transporter;
}

function getResendConfig() {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM;
    if (!apiKey || !from) return null;
    return { apiKey, from };
}

async function sendWithResend(opts) {
    const cfg = getResendConfig();
    if (!cfg) return { sent: false, provider: null };

    await axios.post(
        'https://api.resend.com/emails',
        {
            from: cfg.from,
            to: [opts.to],
            subject: opts.subject,
            text: opts.text,
            html: opts.html || opts.text.replace(/\n/g, '<br>')
        },
        {
            headers: {
                Authorization: `Bearer ${cfg.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: Number(process.env.RESEND_TIMEOUT_MS || 15000)
        }
    );

    return { sent: true, provider: 'resend' };
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string, attachments?: any[] }} opts
 */
async function sendMail(opts) {
    const t = getTransporter();
    const from =
        process.env.SMTP_FROM ||
        process.env.SMTP_FROM_EMAIL ||
        process.env.EMAIL_FROM ||
        process.env.SMTP_USER;

    // Prefer SMTP when configured; fall back to Resend (HTTPS) when SMTP is blocked.
    if (t && from) {
        try {
            await t.sendMail({
                from,
                to: opts.to,
                subject: opts.subject,
                text: opts.text,
                html: opts.html || opts.text.replace(/\n/g, '<br>'),
                ...(opts.attachments ? { attachments: opts.attachments } : {})
            });
            return { sent: true, provider: 'smtp' };
        } catch (err) {
            console.error('[email] SMTP send failed; trying Resend fallback:', err?.code || err?.message || err);
            return await sendWithResend(opts);
        }
    }

    // SMTP not configured at all -> try Resend.
    return await sendWithResend(opts);
}

module.exports = { sendMail, getTransporter };
