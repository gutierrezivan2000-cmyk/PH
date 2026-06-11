import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY no configurada");
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "SOPH.IA <noreply@sophiagrouph.com>";

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const resend = getResend();

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Restablece tu contraseña — SOPH.IA",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:32px 24px;text-align:center;">
      <h1 style="color:#fff;font-size:28px;margin:0;font-weight:800;letter-spacing:-0.5px;">SOPH.IA</h1>
      <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:13px;">Gestion Inteligente de Propiedad Horizontal</p>
    </div>
    <div style="padding:32px 24px;">
      <h2 style="color:#1f2937;font-size:20px;margin:0 0 8px;">Restablece tu contraseña</h2>
      <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón para crear una nueva:
      </p>
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${resetUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;">Crear nueva contraseña</a>
      </div>
      <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:0;">
        Este enlace expira en 30 minutos. Si no solicitaste el cambio, ignora este correo — tu contraseña actual sigue siendo válida.
      </p>
    </div>
    <div style="border-top:1px solid #f3f4f6;padding:16px 24px;text-align:center;">
      <p style="color:#d1d5db;font-size:11px;margin:0;">SOPH.IA &copy; ${new Date().getFullYear()}</p>
    </div>
  </div>
</body>
</html>`,
  });
}

export async function sendVerificationEmail(email: string, code: string): Promise<void> {
  const resend = getResend();

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Verifica tu cuenta — SOPH.IA",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;">
  <div style="max-width:480px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:32px 24px;text-align:center;">
      <h1 style="color:#fff;font-size:28px;margin:0;font-weight:800;letter-spacing:-0.5px;">SOPH.IA</h1>
      <p style="color:rgba(255,255,255,0.7);margin:8px 0 0;font-size:13px;">Gestion Inteligente de Propiedad Horizontal</p>
    </div>
    <div style="padding:32px 24px;">
      <h2 style="color:#1f2937;font-size:20px;margin:0 0 8px;">Verifica tu correo electronico</h2>
      <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Ingresa el siguiente codigo en la pagina de verificacion para activar tu cuenta:
      </p>
      <div style="background:#f5f3ff;border:2px solid #e9d5ff;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
        <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#7c3aed;">${code}</span>
      </div>
      <p style="color:#9ca3af;font-size:12px;line-height:1.5;margin:0;">
        Este codigo expira en 15 minutos. Si no solicitaste esta verificacion, ignora este correo.
      </p>
    </div>
    <div style="border-top:1px solid #f3f4f6;padding:16px 24px;text-align:center;">
      <p style="color:#d1d5db;font-size:11px;margin:0;">SOPH.IA &copy; ${new Date().getFullYear()}</p>
    </div>
  </div>
</body>
</html>`,
  });
}
