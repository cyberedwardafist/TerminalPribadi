// Satu Vercel Function untuk seluruh /api/* (router internal di lib/app.js).
import { handle } from '../lib/app.js';
export const GET = handle, POST = handle, PUT = handle, PATCH = handle, DELETE = handle, OPTIONS = handle, HEAD = handle;
