-- KPI Lacak Lamaran — tiga angka dari PRD § 3.
--
-- Dijalankan manual lewat phpMyAdmin, sesekali, satu per satu. Sengaja tidak
-- otomatis: tidak ada penghitung, tidak ada halaman admin, tidak ada satu baris
-- kode aplikasi pun untuk ini. Angka yang harus dicari sendiri lebih jujur
-- daripada dasbor yang dilihat sambil lalu.
--
-- Ketiganya hanya membaca tabel yang memang sudah ada dan tidak menyentuh data
-- per individu — tidak ada pelacak pihak ketiga, tidak ada profil.
--
-- Angka 2 dan 3 SELALU dibaca berdampingan (PRD § 3 catatan a): orang berhenti
-- memakai aplikasi ini justru karena tujuannya tercapai, jadi pemakaian yang
-- turun sementara angka 3 naik itu keberhasilan, bukan churn.


-- ── 1 ─────────────────────────────────────────────────────────────────────
-- Dari yang mendaftar, berapa persen benar-benar mencatat lamaran?
-- Target awal: 60%.
--
-- Lamaran berstatus 'wishlist' ikut dihitung: barisnya tetap berarti orang itu
-- memakai produknya, bukan sekadar mendaftar lalu pergi. Kalau suatu saat ingin
-- angka yang lebih ketat — hanya yang benar-benar melamar — tambahkan
-- `WHERE status <> 'wishlist'` pada subkueri kedua dan ketiga.

SELECT
  (SELECT COUNT(*) FROM users)                    AS pendaftar,
  (SELECT COUNT(DISTINCT user_id) FROM applications) AS mencatat_lamaran,
  ROUND(
    100 * (SELECT COUNT(DISTINCT user_id) FROM applications)
        / NULLIF((SELECT COUNT(*) FROM users), 0),
    1
  ) AS persen;


-- ── 2 ─────────────────────────────────────────────────────────────────────
-- Berapa orang membuka aplikasi dalam 7 hari terakhir?
-- Target awal: naik dari bulan lalu.
--
-- `users.last_seen_at` diperbarui setiap aplikasi memeriksa sesi saat dimuat.
--
-- PERBANDINGAN DENGAN BULAN LALU TIDAK BISA DIHITUNG DI SINI, dan jangan
-- dipaksakan. Kolom ini hanya menyimpan kunjungan TERAKHIR, bukan riwayat: orang
-- yang aktif bulan lalu dan masih aktif sekarang hanya muncul di jendela hari
-- ini. Query apa pun atas jendela masa lalu justru menghitung orang yang berhenti
-- datang setelah itu — kebalikan dari yang ditanyakan.
--
-- Jadi caranya: jalankan query ini sekali sebulan dan CATAT hasilnya. Tren lahir
-- dari catatan itu. Menyimpan riwayat kunjungan berarti membangun pelacakan per
-- individu, dan PRD § 3 sudah menolak itu dengan sadar.

SELECT
  COUNT(*) AS aktif_7_hari
FROM users
WHERE last_seen_at >= NOW() - INTERVAL 7 DAY;


-- ── 3 ─────────────────────────────────────────────────────────────────────
-- Berapa orang yang sampai menandai satu lamaran jadi "Accepted"?
-- Bintang utara. Target awal: > 0, lalu naik.
--
-- Dihitung dari `status_history`, bukan dari `applications.status`, karena yang
-- ditanyakan adalah peristiwa "pernah menandai" — dan itu tetap terjadi walau
-- lamarannya kemudian diarsipkan atau statusnya diubah lagi. Kalau yang dicari
-- adalah keadaan saat ini, ganti isinya dengan
-- `SELECT COUNT(DISTINCT user_id) FROM applications WHERE status = 'accepted'`;
-- angkanya bisa lebih kecil, dan bedanya bukan galat.

SELECT
  COUNT(DISTINCT a.user_id) AS pengguna_pernah_accepted
FROM status_history h
JOIN applications a ON a.id = h.application_id
WHERE h.status = 'accepted';
