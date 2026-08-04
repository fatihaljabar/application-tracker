import { useStore } from '../lib/store';
import { Confirm } from './ui';

/**
 * Dialog galat global (Lampiran A10 PRD).
 *
 * Dipakai hanya untuk kegagalan yang **menghentikan** pengguna: sesi berakhir,
 * konflik antar tab, dan server tidak terjangkau saat aplikasi dibuka. Galat
 * sementara tetap memakai toast — kalau semuanya memblokir layar, gangguan
 * jaringan sesaat berubah jadi gangguan yang harus diklik.
 *
 * Dirakit dari `Confirm` yang sudah ada, tanpa tombol batal.
 */
export default function AlertDialog() {
  const { alert, dismissAlert } = useStore();
  return (
    <Confirm
      open={!!alert}
      title={alert?.title ?? ''}
      description={alert?.description}
      confirmLabel={alert?.actionLabel ?? 'Tutup'}
      danger={false}
      onConfirm={() => alert?.onAction()}
      onClose={dismissAlert}
    />
  );
}
