const inp = $input.first().json;
const data = inp.body || inp;
const signatureText = 'Best regards,\nOfferPSP team\nhttps://offerpsp.com';
const suppliedText = String(data.body || data.text || '').trim();
const rawText = suppliedText.replace(
  /\n{2,}Best regards,\s*\nOfferPSP team\s*\nhttps:\/\/offerpsp\.com\/?\s*$/i,
  '',
).trim();
const plainText = `${rawText}\n\n${signatureText}`;
const subject = String(data.subject || 'Message from OfferPSP').trim();

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const linkify = (value) => value.replace(
  /(https:\/\/[^\s<]+)/g,
  '<a href="$1" style="color:#ff416f;text-decoration:underline;word-break:break-word">$1</a>',
);

const bodyHtml = rawText
  .split(/\n{2,}/)
  .map((paragraph) => `<p style="margin:0 0 18px;color:#202431;font-size:16px;line-height:1.7">${linkify(escapeHtml(paragraph)).replace(/\n/g, '<br>')}</p>`)
  .join('');

const heading = escapeHtml(String(data.heading || subject));
const preheader = escapeHtml(String(data.preheader || rawText.slice(0, 140)));
const ctaUrl = String(data.cta_url || '').trim();
const ctaLabel = escapeHtml(String(data.cta_label || 'Open OfferPSP'));
const cta = /^https:\/\//i.test(ctaUrl)
  ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:10px 0 26px"><tr><td style="border-radius:12px;background:#ff416f"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:14px 24px;color:#111522;font-size:16px;font-weight:700;text-decoration:none">${ctaLabel}</a></td></tr></table>`
  : '';

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${heading}</title>
  <style>
    @media only screen and (max-width:640px) {
      .email-shell { width:100% !important; border-radius:0 !important; }
      .email-header, .email-body, .email-footer { padding-left:24px !important; padding-right:24px !important; }
      .email-title { font-size:30px !important; line-height:1.15 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f3f4f8;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f4f8">
    <tr>
      <td align="center" style="padding:32px 12px">
        <table class="email-shell" role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:640px;max-width:640px;background:#ffffff;border:1px solid #dfe2eb;border-radius:20px;overflow:hidden">
          <tr>
            <td class="email-header" style="padding:34px 44px 38px;background:#111522;border-top:5px solid #ff416f">
              <div style="margin:0 0 18px;color:#ff6f95;font-size:13px;font-weight:700;letter-spacing:2.4px;text-transform:uppercase">OFFERPSP · PRIVATE PAYMENT MATCHING</div>
              <h1 class="email-title" style="margin:0;color:#fff8ef;font-size:36px;line-height:1.2;font-weight:800">${heading}</h1>
            </td>
          </tr>
          <tr>
            <td class="email-body" style="padding:38px 44px 28px;background:#ffffff">
              ${bodyHtml}
              ${cta}
              <div style="margin-top:26px;padding-top:22px;border-top:1px solid #eceef3;color:#596071;font-size:14px;line-height:1.6">
                Best regards,<br>
                <strong style="color:#202431">OfferPSP team</strong><br>
                <a href="https://offerpsp.com/" style="color:#ff416f;text-decoration:none">offerpsp.com</a>
              </div>
            </td>
          </tr>
          <tr>
            <td class="email-footer" style="padding:22px 44px;background:#f8f9fc;border-top:1px solid #e7e9f0;color:#7a8191;font-size:12px;line-height:1.6">
              OfferPSP · BRAININDEX OÜ ·
              <a href="mailto:bizdev@offerpsp.com" style="color:#596071;text-decoration:underline">bizdev@offerpsp.com</a><br>
              Private B2B payment-provider matching and controlled introductions.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

return [{ json: {
  to: String(data.to || '').trim(),
  subject,
  text: plainText,
  html,
  from_name: String(data.from_name || 'OfferPSP'),
}}];
