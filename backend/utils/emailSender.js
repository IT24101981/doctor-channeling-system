'use strict';

const nodemailer = require('nodemailer');

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
