/**
 * Pemuat Google Identity Services.
 *
 * Kenapa tombol Google dirender tak terlihat lalu ditumpuk di atas tombol kita,
 * bukan memakai tombol bawaan Google: desain terkunci, dan tombol bawaan Google
 * punya gayanya sendiri yang tidak bisa disamakan. Menumpuknya membuat klik yang
 * diterima Google tetap klik pengguna yang asli — itu syarat GIS, dan tidak bisa
 * diakali dengan memanggil klik dari kode.
 */

interface GoogleId {
  initialize(config: {
    client_id: string;
    callback: (res: { credential: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<GoogleId> | null = null;

export function loadGoogleIdentity(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SRC;
    el.async = true;
    el.onload = () => {
      const id = window.google?.accounts?.id;
      if (id) resolve(id);
      else reject(new Error('Google Identity Services gagal dimuat.'));
    };
    el.onerror = () => {
      loading = null;
      reject(new Error('Tidak bisa memuat Google Identity Services.'));
    };
    document.head.appendChild(el);
  });
  return loading;
}
