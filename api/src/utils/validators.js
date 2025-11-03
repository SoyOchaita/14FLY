import { HttpError } from "./response.js";

export function validateFullName(full_name) {
  const pattern = /^[A-Za-zÁÉÍÓÚáéíóúÑñ ]+$/;
  const name = full_name?.trim();
  if (!name || name.length < 3) {
    throw new HttpError("El campo 'full_name' es obligatorio y debe tener al menos 3 letras.", 400);
  }
  if (!pattern.test(name)) {
    throw new HttpError("El campo 'full_name' solo puede contener letras y espacios (sin números ni símbolos).", 400);
  }
  return name;
}
