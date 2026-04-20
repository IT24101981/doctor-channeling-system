'use strict';

const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
    if (transporter !== undefined) return transporter;
    // In some serverless environments (ex: Vercel), raw SMTP TCP egress can be blocked/unreliable.
    // If SMTP env vars aren't present, we simply return null and allow API-based providers in sendMail().
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
        transporter = null;
        return null;
    }
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
    const forceIpv4 =
        String(process.env.SMTP_FORCE_IPV4 || '').toLowerCase() === 'true' ||
        (process.env.SMTP_FORCE_IPV4 === undefined &&
            String(process.env.NODE_ENV || '').toLowerCase() === 'production');
    const timeoutMs = Number(process.env.SMTP_TIMEOUT_MS || 20000);
    transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        ...(Number.isFinite(timeoutMs) && timeoutMs > 0
            ? {
                  connectionTimeout: timeoutMs,
                  greetingTimeout: timeoutMs,
                  socketTimeout: timeoutMs
              }
            : {}),
        ...(forceIpv4 ? { family: 4 } : {})
    });
    return transporter;
}

async function sendViaResend(opts) {
    const apiKey = String(process.env.RESEND_API_KEY || '').trim();
    if (!apiKey) return { sent: false };

    const from =
        String(process.env.RESEND_FROM || '').trim() ||
        String(process.env.SMTP_FROM || process.env.SMTP_FROM_EMAIL || process.env.EMAIL_FROM || '').trim();
    if (!from) {
        throw new Error('RESEND_FROM (or SMTP_FROM/EMAIL_FROM) is required when using Resend');
    }

    if (typeof fetch !== 'function') {
        throw new Error('Global fetch is not available in this Node runtime');
    }

    const payload = {
        from,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        html: opts.html || opts.text.replace(/\n/g, '<br>')
    };

    const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        const err = new Error(`Resend API error: ${resp.status} ${resp.statusText}`);
        err.details = body;
        throw err;
    }

    return { sent: true };
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string, attachments?: any[] }} opts
 */
async function sendMail(opts) {
    // Prefer HTTP-based providers when configured (works in serverless where SMTP may fail).
    if (String(process.env.RESEND_API_KEY || '').trim()) {
        return await sendViaResend(opts);
    }

    const t = getTransporter();
    const from =
        process.env.SMTP_FROM ||
        process.env.SMTP_FROM_EMAIL ||
        process.env.EMAIL_FROM ||
        process.env.SMTP_USER;
    if (!t || !from) {
        console.warn('[email] SMTP not configured; skipping send to', opts.to);
        return { sent: false };
    }
    await t.sendMail({
        from,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html || opts.text.replace(/\n/g, '<br>'),
        ...(opts.attachments ? { attachments: opts.attachments } : {})
    });
    return { sent: true };
}

module.exports = { sendMail, getTransporter };
