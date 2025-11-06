import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { ok, HttpError } from "../utils/response.js";
import { validateEmail, allowedDomainsForMessage } from "../utils/emailValidator.js";
import { validateFullName } from "../utils/validators.js";
import { validateCUI } from "../services/cui.service.js";
import { sendMail, renderTemplate } from "../utils/mailer.js";

export const register = async (req, res) => {
  try {
    const { full_name, email, password, cui } = req.body;
    const allowedForMsg = allowedDomainsForMessage();

    if (!full_name || !email || !password || !cui) {
      throw new HttpError(
        `Datos incompletos. Estructura esperada: { full_name: string, email: string (${allowedForMsg}), password: string, cui: string (####-#####-#### o 13 dígitos) }`,
        400
      );
    }
    // Validar nombre completo (letras, espacios, acentos y ñ; mín. 3 letras)
    const normalizedName = validateFullName(full_name);
    // Valida formato y dominio permitido con util centralizado
    validateEmail(email);
    // Validar contraseña segura
    const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&._#-])[A-Za-z\d@$!%*?&._#-]{8,}$/;
    const cleanPassword = password?.trim();
    if (!cleanPassword) {
      throw new HttpError("La contraseña es obligatoria y no puede estar vacía.", 400);
    }
    if (!passwordPattern.test(cleanPassword)) {
      throw new HttpError(
        "La contraseña debe tener mínimo 8 caracteres, con al menos una mayúscula, una minúscula, un número y un símbolo.",
        400
      );
    }
    // CUI obligatorio y válido según formato guatemalteco
    if (!cui) {
      throw new HttpError("El campo 'cui' es obligatorio.", 400);
    }
    if (!validateCUI(cui)) {
      throw new HttpError("El CUI proporcionado no es válido según el formato guatemalteco.", 400);
    }

    const hash = await bcrypt.hash(cleanPassword, 10);
    const query = "INSERT INTO users(full_name, email, password_hash, cui) VALUES ($1,$2,$3,$4) RETURNING user_id, full_name, email, cui";
    const { rows } = await pool.query(query, [normalizedName, email, hash, String(cui).replace(/\s/g,'').replace(/-/g,'')]);
    // Envío de correo de bienvenida (best-effort, no bloqueante)
    if (email) {
      const safeName = normalizedName || email;
      const html = renderTemplate({
        title: 'Bienvenido a 14FLY',
        intro: 'Tu cuenta ha sido creada exitosamente.',
        contentHtml: `<p>Hola <strong>${safeName}</strong>,</p>
          <p>¡Nos alegra tenerte a bordo! Ya puedes gestionar tus reservas y disfrutar de beneficios exclusivos.</p>`
      });
      sendMail({ to: email, subject: 'Bienvenido a 14FLY', html, text: `Hola ${safeName}, tu cuenta ha sido creada exitosamente. Bienvenido a 14FLY.` })
        .catch(e => console.warn('Fallo al enviar correo de bienvenida:', e.message));
    }
    return ok(res, "Usuario registrado con éxito", rows[0], 201);
  } catch (err) {
    if (err.code === '23505') {
      // Violación de restricción única (correo o CUI ya existe)
      const detail = err.detail || '';
      const match = detail.match(/Key \(([^)]+)\)=\(([^)]+)\) already exists/i);
      if (match) {
        const field = (match[1] || '').toLowerCase();
        const value = match[2] || '';
        if (field === 'email') {
          return res.status(409).json({
            success: false,
            message: `El correo "${value}" ya está asociado a una cuenta. Si ya tienes cuenta, inicia sesión. Si necesitas registrar otra, utiliza un correo con dominio permitido (${allowedDomainsForMessage()}).`,
            data: null
          });
        }
        if (field === 'cui') {
          return res.status(409).json({
            success: false,
            message: `El CUI ${value} ya está asociado a una cuenta. Verifica el número o contáctanos si crees que se trata de un error.`,
            data: null
          });
        }
      }
      return res.status(409).json({ success: false, message: 'Ya existe una cuenta con los datos proporcionados (correo o CUI).', data: null });
    }
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

export const me = async (req, res) => {
  try {
    const { id } = req.user;
    const { rows } = await pool.query(
      "SELECT user_id, full_name, email, cui, created_at FROM users WHERE user_id=$1",
      [id]
    );
    if (!rows.length) throw new HttpError("Usuario no encontrado.", 404);
    return ok(res, "Perfil de usuario", rows[0]);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      throw new HttpError(
        "Credenciales incompletas. Estructura esperada: { email: string, password: string }",
        400
      );
    }
    // Valida formato y dominio permitido antes de consultar
    validateEmail(email);
    const user = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
    if (!user.rows.length) throw new HttpError("Usuario no encontrado. Verifica email y contraseña.", 404);

    const valid = await bcrypt.compare(password, user.rows[0].password_hash);
    if (!valid) throw new HttpError("Credenciales inválidas. Verifica email y contraseña.", 401);

    const token = jwt.sign(
      { id: user.rows[0].user_id, email: user.rows[0].email },
      process.env.JWT_SECRET,
      { expiresIn: "4h" }
    );
    const profile = {
      user_id: user.rows[0].user_id,
      full_name: user.rows[0].full_name,
      email: user.rows[0].email,
      cui: user.rows[0].cui,
    };
    return ok(res, "Login exitoso", { token, profile });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};

export const isVip = async (req, res) => {
  try {
    const { id } = req.user;
    const { rows } = await pool.query("SELECT COUNT(*)::int AS cnt FROM reservations WHERE user_id=$1", [id]);
    const count = rows[0]?.cnt || 0;
    const vip = count >= 5;
    return ok(res, vip ? "Usuario VIP" : "Usuario estándar", { isVIP: vip, reservations: count });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ success: false, message: err.message, data: err.data || null });
  }
};
