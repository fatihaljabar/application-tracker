import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { gzipSync } from 'node:zlib';
import express from 'express';
import { errorHandler } from './lib/middleware.ts';

/**
 * Body yang rusak adalah salah kirim dari klien. Kalau dilaporkan sebagai 500,
 * antarmuka menampilkan "kesalahan di server" untuk sesuatu yang bukan salah
 * server, dan log terisi "[unhandled]" palsu yang menutupi bug sungguhan.
 *
 * Kasus gzip dengan byte sisa juga menjaga regresi CVE-2026-111181: di
 * body-parser < 2.4.0 payload itu mematikan seluruh proses.
 */
describe('body rusak dijawab 4xx, server tetap hidup', () => {
  let base = '';
  let close = () => {};
  before(async () => {
    const app = express();
    app.use(express.json({ limit: '256kb' }));
    app.post('/', (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
      const server = app.listen(0, () => {
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
        close = () => server.close();
        resolve();
      });
    });
  });
  after(() => close());

  const kirim = (body: string | Buffer, headers: Record<string, string> = {}) =>
    fetch(base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
    });

  it('JSON rusak: 400', async () => {
    assert.equal((await kirim('{"a":')).status, 400);
  });

  it('body melewati batas: 413', async () => {
    assert.equal((await kirim(JSON.stringify({ x: 'a'.repeat(300_000) }))).status, 413);
  });

  it('gzip dengan byte sisa: 4xx dan proses tidak mati', async () => {
    const body = Buffer.concat([gzipSync('{"a":1}'), Buffer.from('sisa')]);
    const res = await kirim(body, { 'content-encoding': 'gzip' });
    assert.ok(res.status >= 400 && res.status < 500, `dapat ${res.status}`);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal((await kirim('{"a":1}')).status, 200, 'server berhenti melayani');
  });
});
