// Validadores compartidos
export function validateFullName(name: string): string | null {
	const n = (name || '').trim();
	if (n.length < 3) return null;
	if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+$/.test(n)) return null;
	return n;
}

export function validateEmailFormat(email: string): boolean {
	const e = (email || '').trim();
	if (!e) return false;
	const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
	return re.test(e);
}

export function validatePasswordComplex(pwd: string): boolean {
	const pattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&._#-])[A-Za-z\d@$!%*?&._#-]{8,}$/;
	return pattern.test(pwd || '');
}

export function normalizeCui(raw: string): string {
	return (raw || '').replace(/\D/g,'');
}
