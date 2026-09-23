import { NextFunction, Request, Response } from "express";
import { searchAddress } from "../services/geocode.service";

// GET /api/geo/search?q=  (authenticated) — address autocomplete for any
// free-text location field (delivery destination, pickup override, etc).
export async function searchAddressHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 1) return res.json({ data: [] });

    const results = await searchAddress(q);
    return res.json({ data: results });
  } catch (err) {
    return next(err);
  }
}
