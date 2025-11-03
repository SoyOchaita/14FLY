// Validación de CUI (DPI) de Guatemala basada en la directiva Angular proporcionada
// Acepta formato ####-#####-#### o 13 dígitos, valida depto/municipio y dígito verificador (complemento 11)

const cityCountPerRegion = [
  17, // 01 - Guatemala
   8, // 02 - El Progreso
  16, // 03 - Sacatepéquez
  16, // 04 - Chimaltenango
  13, // 05 - Escuintla
  14, // 06 - Santa Rosa
  19, // 07 - Sololá
   8, // 08 - Totonicapán
  24, // 09 - Quetzaltenango
  21, // 10 - Suchitepéquez
   9, // 11 - Retalhuleu
  30, // 12 - San Marcos
  32, // 13 - Huehuetenango
  21, // 14 - Quiché
   8, // 15 - Baja Verapaz
  17, // 16 - Alta Verapaz
  14, // 17 - Petén
   5, // 18 - Izabal
  11, // 19 - Zacapa
  11, // 20 - Chiquimula
   7, // 21 - Jalapa
  17  // 22 - Jutiapa
];

export function validateCUI(modelValue) {
  if (!modelValue) return true; // si no viene valor, no bloquear
  let dpi = String(modelValue);
  const dpiRegExp = /^[0-9]{4}[\s\-]?[0-9]{5}[\s\-]?[0-9]{4}$/;
  if (!dpiRegExp.test(dpi)) return false;

  // Normalizar sin espacios ni guiones
  dpi = dpi.replace(/\s/g, '').split('-').join('');

  // Extraer segmentos
  const regionCode = parseInt(dpi.substring(9, 11), 10); // depto
  const cityCode = parseInt(dpi.substring(11, 13), 10);   // municipio
  const dpiNumber = dpi.substring(0, 8);                  // primeros 8
  const verifier = parseInt(dpi.substring(8, 9), 10);     // 9no dígito

  if (!regionCode || !cityCode) return false;
  if (regionCode > cityCountPerRegion.length) return false;
  if (cityCode > cityCountPerRegion[regionCode - 1]) return false;

  // Verificación con complemento 11
  let total = 0;
  for (let i = 0; i < dpiNumber.length; i++) {
    total += parseInt(dpiNumber[i], 10) * (i + 2);
  }
  const modulus = total % 11;
  return modulus === verifier;
}

