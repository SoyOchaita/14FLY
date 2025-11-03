export const ok = (res, message = "OK", data = null, status = 200) =>
  res.status(status).json({ success: true, message, data });

export const fail = (res, message = "Error", status = 400, data = null) =>
  res.status(status).json({ success: false, message, data });

export class HttpError extends Error {
  constructor(message, status = 400, data = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}
