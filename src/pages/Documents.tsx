import { useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { PageHeader } from '../components/shared';
import { Button, Confirm, Empty, Field, Icon, Input, Modal, Progress, SearchInput, Select } from '../components/ui';
import { DOC_CATEGORIES } from '../lib/constants';
import { DOC_MAX_COUNT, DOC_MAX_FILE_BYTES, DOC_MAX_TOTAL_BYTES, type DocCategory, type DocFile } from '@shared/types';
import { cx, fileSize, fmtDate } from '../lib/utils';

const CAT_ICON: Record<DocCategory, string> = {
  cv: 'fi-rr-portrait',
  cover_letter: 'fi-rr-envelope',
  portfolio: 'fi-rr-briefcase-blank',
  certificate: 'fi-rr-badge-check',
  diploma: 'fi-rr-graduation-cap',
  transcript: 'fi-rr-file-invoice',
  other: 'fi-rr-file',
};

export default function Documents() {
  const { t, db, lang, addDoc, deleteDoc, toast, saving, uploadPercent } = useStore();
  const tz = db.settings.timezone;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ name: string; size: number; mime: string; dataUrl: string } | null>(null);
  const [meta, setMeta] = useState({
    label: '',
    group: 'CV Utama',
    category: 'cv' as DocCategory,
    language: 'id' as 'id' | 'en' | '-',
    version: 'v1',
    note: '',
  });
  const [err, setErr] = useState<Record<string, string>>({});

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = db.docs
      .filter((d) => !term || (`${d.label} ${d.group} ${d.name}`).toLowerCase().includes(term))
      .filter((d) => !cat || d.category === cat);
    const map = new Map<string, DocFile[]>();
    filtered.forEach((d) => {
      map.set(d.group, [...(map.get(d.group) ?? []), d]);
    });
    return Array.from(map.entries()).map(([g, items]) => [
      g,
      [...items].sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt)),
    ]) as [string, DocFile[]][];
  }, [db.docs, q, cat]);

  // Hanya dokumen siap yang dihitung — sama seperti perhitungan kuota di server.
  const usedBytes = db.docs.reduce((sum, d) => sum + d.size, 0);

  const readFile = (file: File) => {
    if (file.size > DOC_MAX_FILE_BYTES) {
      toast(t('doc.tooBig'), 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPending({
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        dataUrl: String(reader.result),
      });
      setMeta((m) => ({ ...m, label: m.label || file.name.replace(/\.[^.]+$/, '') }));
    };
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!pending) e.file = t('doc.dropHint');
    if (!meta.label.trim()) e.label = `${t('doc.label')} ${t('c.required')}`;
    if (!meta.group.trim()) e.group = `${t('doc.group')} ${t('c.required')}`;
    setErr(e);
    if (Object.keys(e).length || !pending) return;
    // Menunggu server sebelum menutup. Form yang menutup lebih dulu pernah
    // membuat isian pengguna hilang saat simpan ternyata gagal.
    const ok = await addDoc({
      name: pending.name,
      label: meta.label.trim(),
      group: meta.group.trim(),
      category: meta.category,
      language: meta.language,
      version: meta.version.trim() || 'v1',
      size: pending.size,
      mime: pending.mime,
      dataUrl: pending.dataUrl,
      uploadedAt: new Date().toISOString(),
      note: meta.note.trim(),
    }, t('doc.uploaded'));
    if (!ok) return;
    setOpen(false);
    setPending(null);
    setMeta({ label: '', group: 'CV Utama', category: 'cv', language: 'id', version: 'v1', note: '' });
  };

  return (
    <>
      <PageHeader
        title={t('doc.title')}
        subtitle={t('doc.subtitle')}
        actions={
          <Button variant="primary" icon="fi-rr-cloud-upload-alt" onClick={() => setOpen(true)}>
            {t('doc.upload')}
          </Button>
        }
      />

      <div className="anim-fade-up flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:p-5">
        <SearchInput value={q} onChange={setQ} placeholder={t('c.search')} className="flex-1" />
        <Select
          className="sm:w-[190px]"
          value={cat}
          onChange={setCat}
          placeholder={t('doc.category')}
          options={[
            { value: '', label: t('c.all') },
            ...DOC_CATEGORIES.map((c) => ({ value: c, label: t(`doc.cat.${c}`) })),
          ]}
        />
      </div>

      {/* A7 — sisa kuota penyimpanan (PRD § 6.7: "pengguna melihat sisa
          kuotanya di halaman Dokumen"). Dihitung dari data yang sudah ada di
          memori, jadi tidak ada panggilan tambahan. Angka yang mengikat tetap
          pemeriksaan di server. */}
      <div className="anim-fade-up mt-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="flex items-center gap-2 text-[12.5px] font-medium text-[var(--ink)]">
            <Icon name="fi-rr-cloud" className="text-[12px] text-[var(--ink-muted)]" />
            {t('doc.quota')}
          </span>
          <span className="text-[11.5px] text-[var(--ink-muted)]">
            {/* fileSize(0) sengaja em dash untuk "ukuran tak diketahui" di kartu
                dokumen; di sini nol adalah angka yang sah dan harus terbaca. */}
            {usedBytes ? fileSize(usedBytes) : '0 MB'} {t('doc.quotaOf')}{' '}
            {fileSize(DOC_MAX_TOTAL_BYTES)} ·{' '}
            {db.docs.length}/{DOC_MAX_COUNT}
          </span>
        </div>
        <Progress
          value={(usedBytes / DOC_MAX_TOTAL_BYTES) * 100}
          color={usedBytes / DOC_MAX_TOTAL_BYTES >= 0.9 ? 'var(--danger)' : undefined}
        />
      </div>

      {groups.length === 0 ? (
        <Empty
          icon="fi-rr-document"
          title={t('c.empty')}
          description={t('doc.maxSize')}
          action={
            <Button variant="soft" icon="fi-rr-cloud-upload-alt" onClick={() => setOpen(true)}>
              {t('doc.upload')}
            </Button>
          }
        />
      ) : (
        <div className="mt-5 space-y-6">
          {groups.map(([group, items], gi) => (
            <section
              key={group}
              className="anim-fade-up rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
              style={{ animationDelay: `${gi * 40}ms` }}
            >
              <div className="mb-4 flex items-center gap-2">
                <Icon name="fi-rr-folder" className="text-[12px] text-[var(--ink-muted)]" />
                <h2 className="text-[13.5px] font-semibold text-[var(--ink)]">{group}</h2>
                <span className="rounded-full bg-[var(--bg-soft)] px-2 py-0.5 text-[11px] text-[var(--ink-muted)]">
                  {items.length} {t('doc.versions').toLowerCase()}
                </span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {items.map((d) => {
                  const used = db.apps.filter((a) => a.documentIds.includes(d.id)).length;
                  return (
                    <div
                      key={d.id}
                      className="group flex items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5 transition-all duration-200 hover:border-[var(--line-strong)]"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--bg-soft)] text-[14px] text-[var(--ink-soft)]">
                        <Icon name={CAT_ICON[d.category]} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-[var(--ink)]">{d.label}</p>
                        <p className="truncate text-[11.5px] text-[var(--ink-muted)]">
                          {t(`doc.cat.${d.category}`)} · {d.version}
                          {d.language !== '-' && ` · ${d.language.toUpperCase()}`} · {fileSize(d.size)}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--ink-muted)]">
                          {fmtDate(d.uploadedAt, lang, tz)}
                          {used > 0 && ` · ${t('doc.usedIn')} ${used} ${t('doc.apps')}`}
                        </p>
                      </div>
                      {/* Sama seperti di halaman Pengingat: di layar sentuh varian
                          hover tidak pernah berlaku, dan di sini yang tersembunyi
                          adalah tombol UNDUH — pengguna ponsel tidak bisa mengambil
                          dokumennya sendiri (PRD § 6.7, § 9). */}
                      <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                        {/* Tautan biasa, bukan fetch: unduhan adalah navigasi ke
                            endpoint kita, yang memeriksa kepemilikan lalu
                            mengalihkan ke URL bertanda tangan berumur 5 menit.
                            Navigasi tidak tunduk CORS — fetch tunduk, dan akan
                            ditolak karena bucket hanya mengizinkan PUT. */}
                        <a href={`/api/documents/${d.id}/download`} title={t('doc.download')}>
                          <span className="grid h-7 w-7 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-soft)] hover:text-[var(--ink)]">
                            <Icon name="fi-rr-download" className="text-[11px]" />
                          </span>
                        </a>
                        <button type="button"
                          onClick={() => setConfirmId(d.id)}
                          aria-label={`${t('c.delete')}: ${d.label}`}
                          className="grid h-7 w-7 place-items-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--danger)]/10 hover:text-[var(--danger)] cursor-pointer"
                        >
                          <Icon name="fi-rr-trash" className="text-[11px]" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('doc.upload')}
        subtitle={t('doc.maxSize')}
        footer={
          <>
            <Button variant="ghost" disabled={saving} onClick={() => setOpen(false)}>
              {t('c.cancel')}
            </Button>
            <Button variant="primary" icon="fi-rr-check" pending={saving} onClick={submit}>
              {t('c.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: seret-lepas hanya pelengkap; <input type="file"> di bawah tetap jalur utama yang bisa dijangkau papan ketik. */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: sama — tidak ada aksi yang hanya bisa dicapai lewat seret. */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) readFile(f);
            }}
            onClick={() => fileRef.current?.click()}
            className={cx(
              'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-9 text-center transition-all duration-200',
              drag
                ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                : 'border-[var(--line-strong)] bg-[var(--surface-2)] hover:border-[var(--accent)]',
            )}
          >
            <Icon name="fi-rr-cloud-upload-alt" className="text-[22px] text-[var(--ink-muted)]" />
            <p className="mt-3 text-[13px] font-medium text-[var(--ink)]">
              {pending ? pending.name : t('doc.dropHint')}
            </p>
            <p className="mt-1 text-[11.5px] text-[var(--ink-muted)]">
              {pending ? fileSize(pending.size) : t('doc.maxSize')}
            </p>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
              }}
            />
          </div>
          {err.file && <p className="text-[11.5px] text-[var(--danger)]">{err.file}</p>}

          {/* A3 — kemajuan unggah. Berkas 2 MB butuh beberapa detik di jaringan
              lambat, dan tanpa penanda ini layar terlihat menggantung. */}
          {uploadPercent !== null && (
            <div className="anim-fade space-y-1.5">
              <div className="flex items-center justify-between text-[11.5px] text-[var(--ink-muted)]">
                <span>{t('doc.uploading')}</span>
                <span>{uploadPercent}%</span>
              </div>
              <Progress value={uploadPercent} />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('doc.label')} error={err.label}>
              <Input
                value={meta.label}
                onChange={(e) => setMeta((m) => ({ ...m, label: e.target.value }))}
                placeholder="CV ATS 2025"
              />
            </Field>
            <Field label={t('doc.group')} error={err.group} hint="CV Utama, Cover Letter Gojek…">
              <Input
                value={meta.group}
                onChange={(e) => setMeta((m) => ({ ...m, group: e.target.value }))}
              />
            </Field>
            <Field label={t('doc.category')}>
              <Select
                value={meta.category}
                onChange={(v) => setMeta((m) => ({ ...m, category: v as DocCategory }))}
                options={DOC_CATEGORIES.map((c) => ({ value: c, label: t(`doc.cat.${c}`) }))}
              />
            </Field>
            <Field label={t('doc.language')}>
              <Select
                value={meta.language}
                onChange={(v) => setMeta((m) => ({ ...m, language: v as 'id' | 'en' | '-' }))}
                options={[
                  { value: 'id', label: 'Bahasa Indonesia' },
                  { value: 'en', label: 'English' },
                  { value: '-', label: t('c.none') },
                ]}
              />
            </Field>
            <Field label="Versi">
              <Input
                value={meta.version}
                onChange={(e) => setMeta((m) => ({ ...m, version: e.target.value }))}
                placeholder="v1"
              />
            </Field>
            <Field label={t('f.notes')} hint={t('c.optional')}>
              <Input
                value={meta.note}
                onChange={(e) => setMeta((m) => ({ ...m, note: e.target.value }))}
              />
            </Field>
          </div>
        </div>
      </Modal>

      <Confirm
        open={!!confirmId}
        title={t('c.confirmDelete')}
        description={t('c.confirmDeleteDesc')}
        confirmLabel={t('c.yesDelete')}
        cancelLabel={t('c.cancel')}
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) deleteDoc(confirmId);
          setConfirmId(null);
        }}
      />
    </>
  );
}
