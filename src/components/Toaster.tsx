import { createPortal } from 'react-dom';
import { useStore } from '../lib/store';
import { Icon } from './ui';

const toneMap = {
  success: { icon: 'fi-rr-check', color: 'var(--ok)' },
  error: { icon: 'fi-rr-cross-small', color: 'var(--danger)' },
  info: { icon: 'fi-rr-info', color: 'var(--ink-soft)' },
};

export default function Toaster() {
  const { toasts, dismissToast } = useStore();
  return createPortal(
    <div className="pointer-events-none fixed bottom-5 right-1/2 z-[200] flex w-[min(92vw,360px)] translate-x-1/2 flex-col gap-2 sm:bottom-6 sm:right-6 sm:translate-x-0">
      {toasts.map((t) => {
        const tone = toneMap[t.tone];
        return (
          <div
            key={t.id}
            className="anim-slide-right pointer-events-auto flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-soft)]"
          >
            <span
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
              style={{ background: `${tone.color}1f`, color: tone.color }}
            >
              <Icon name={tone.icon} className="text-[12px]" />
            </span>
            <p className="flex-1 text-[13px] leading-snug text-[var(--ink)]">{t.message}</p>
            <button type="button"
              onClick={() => dismissToast(t.id)}
              className="grid h-6 w-6 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--ink)] cursor-pointer"
            >
              <Icon name="fi-rr-cross-small" className="text-[13px]" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
