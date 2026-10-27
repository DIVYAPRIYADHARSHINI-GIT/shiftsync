// Fully static, client-rendered app: no server data loading, no accounts, no network.
// The single server route in the project is the PDF generator under /api/pdf.
export const prerender = true;
export const ssr = false;
