/**
 * E-mail du lien de connexion envoyé par SMTP (un compte Gmail suffit, avec un
 * mot de passe d'application) : aucun domaine à posséder, et n'importe quelle
 * adresse peut le recevoir, contrairement à Resend sans domaine vérifié.
 */
import nodemailer from 'nodemailer';
import { BRAND } from '@iptv/shared';

export const smtpEnabled = Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);

let transport: nodemailer.Transporter | null = null;
function mailer() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
  }
  return transport;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function sendLoginMail(to: string, url: string) {
  const name = BRAND.name;
  await mailer().sendMail({
    from: `${name} <${process.env.SMTP_USER}>`,
    to,
    subject: `Votre lien de connexion à ${name}`,
    text: `Bonjour,\n\nPour vous connecter à ${name}, ouvrez ce lien (valable 24 heures) :\n${url}\n\nSi vous n'avez rien demandé, ignorez simplement cet e-mail.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#111">
<h1 style="font-size:20px">Connexion à ${name}</h1>
<p>Cliquez sur le bouton pour vous connecter. Le lien est valable 24 heures.</p>
<p style="margin:28px 0"><a href="${esc(url)}" style="background:${BRAND.accent};color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">Se connecter</a></p>
<p style="color:#666;font-size:13px">Si vous n'avez rien demandé, ignorez simplement cet e-mail.</p>
</div>`,
  });
}
