# One-shot seeder: injects a `workflow:` block into each vault role contract frontmatter.
# ponytail: run once, then edit the vault by hand (Obsidian is the source of truth). Re-running replaces the block.
import re, sys, yaml, pathlib

VAULT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/root/Projects/second-brain-2/vault')
ROLES = VAULT / '04-ridha-memory/roles'

def cron(job, label): return {'jenis': 'cron', 'job': job, 'label': label}
def ev(label): return {'jenis': 'event', 'label': label}
def to(ke, apa, sop=None): return {'ke': ke, 'apa': apa, **({'sop': sop} if sop else {})}
def esc(ke, kapan): return {'ke': ke, 'kapan': kapan}

W = {
 'general-manager': dict(meja='M1', jabatan='General Manager', atasan='tony', pengawas='tony', uang=True, butuh_tony=True,
   skills=['rdk-role-general-manager'], sistem=['wms', 'bendahara', 'discord', 'kanban'],
   pemicu=[cron('RDK Office Roll-call', 'Senin 07:00 — ringkasan pekan'), ev('Eskalasi kanban / Discord dari role lain')],
   tugas=['Agregasi 4 pilar: order, produksi, biaya/HPP, risiko', 'Putuskan approval PO / OPEX / kontrak', 'Tetapkan prioritas saat friksi antar meja'],
   serah=[to('admin-kantor', 'Approval PO → terbitkan PO resmi', 'SOP-01'), to('admin-kantor', 'Approval kontrak & penawaran buyer', 'SOP-03'), to('cs-komplain', 'Keputusan resolusi komplain', 'SOP-04'), to('bendahara', 'Instruksi dana kompensasi / refund', 'SOP-04')],
   eskalasi=[esc('tony', 'PO > Rp 50 juta / keputusan strategis')], sop=['SOP-01', 'SOP-03', 'SOP-04']),
 'risk-compliance': dict(meja='M1', jabatan='Risk & Compliance', atasan='general-manager', pengawas='general-manager', uang=False, butuh_tony=False,
   skills=['rdk-role-risk-compliance'], sistem=['wms', 'kanban', 'discord'],
   pemicu=[cron('RDK Office Roll-call', 'Rabu & Sabtu 07:00'), ev('Flag anomali dari role lain')],
   tugas=['Audit SLA balasan CS', 'Alarm stok kritis tanpa PO', 'Patroli kepatuhan SOP semua meja'],
   serah=[], eskalasi=[esc('general-manager', 'Anomali sistemik / pelanggaran SOP berulang')], sop=['SOP-00']),
 'bendahara': dict(meja='M1', jabatan='CFO / Bendahara', alias=['Pak Darmaji'], atasan='general-manager', pengawas='tony', uang=True, butuh_tony=True,
   skills=['rdk-bendahara', 'rdk-accounting-reporting', 'rdk-reconciliation', 'rdk-tax-compliance', 'rdk-audit-compliance', 'rdk-cash-liquidity', 'rdk-budgeting-fpna', 'rdk-strategic-finance'],
   sistem=['bendahara', 'discord'],
   pemicu=[cron('RDK Finance Gap Audit Weekly', 'Senin 08:30'), cron('RDK Finance HPP Closing', '21:15 harian — HPP (persona Pak Darmaji)'), ev('Bukti transaksi masuk #bukti-transaksi'), ev('PO resmi terbit (SOP-01)')],
   tugas=['Telaah bukti → draft jurnal double-entry (propose)', 'Validasi HPP closing', 'Rekonsiliasi bank & audit gap mingguan'],
   serah=[to('tony', 'Draft jurnal menunggu approve owner'), to('admin-produksi', 'DP diterima → SPK produksi aktif', 'SOP-03')],
   eskalasi=[esc('general-manager', 'Deviasi biaya > Rp 500rb'), esc('tony', 'Approve draft jurnal (gate Tier A)')], sop=['SOP-01', 'SOP-03', 'SOP-04', 'SOP-05']),
 'admin-produksi': dict(meja='M2', jabatan='Admin Produksi (Stok/HPP)', atasan='general-manager', pengawas='risk-compliance', uang=True, butuh_tony=False,
   skills=['rdk-role-admin-produksi'], sistem=['wms', 'bendahara', 'discord'],
   pemicu=[cron('RDK Office Roll-call', '07:00 harian — rekap backlog'), cron('RDK Office Closing', '21:00 harian — tutup buku order')],
   tugas=['Rekap backlog order & jadwal produksi', 'Pantau stok bahan baku vs ROP', 'Catat output pressing + batch', 'Tindak lanjut temuan reject QC'],
   serah=[to('quality-control', 'Batch selesai pressing → inspeksi QC', 'SOP-02'), to('procurement', 'Permintaan PO bahan baku', 'SOP-01')],
   eskalasi=[esc('procurement', 'Cadangan bahan baku < 2 hari'), esc('risk-compliance', 'Cadangan bahan baku < 2 hari'), esc('general-manager', 'HPP naik > 10% dari baseline')], sop=['SOP-02', 'SOP-03', 'SOP-05']),
 'quality-control': dict(meja='M2', jabatan='Quality Control', atasan='general-manager', pengawas='risk-compliance', uang=False, butuh_tony=False,
   skills=['rdk-role-quality-control'], sistem=['wms', 'discord'],
   pemicu=[cron('RDK Office Roll-call', '07:00 harian — audit yield'), cron('RDK Office Closing', '21:00 harian — audit mutu'), ev('Batch siap dari Mas Tukijo')],
   tugas=['Sampling 5% batch: EC, moisture, berat', 'Putuskan LOLOS / TAHAN batch', 'Statistik reject harian'],
   serah=[to('checker-packing', 'Batch lolos QC → packing', 'SOP-02'), to('admin-produksi', 'Batch ditahan → remill / jemur ulang', 'SOP-02'), to('general-manager', 'Hasil investigasi komplain', 'SOP-04')],
   eskalasi=[esc('admin-produksi', 'Reject > 10% sehari'), esc('risk-compliance', 'Reject > 10% sehari'), esc('general-manager', 'Perubahan standar mutu')], sop=['SOP-02', 'SOP-04']),
 'procurement': dict(meja='M2', jabatan='Procurement', atasan='general-manager', pengawas='risk-compliance', uang=True, butuh_tony=False,
   skills=['rdk-role-procurement'], sistem=['bendahara', 'discord'],
   pemicu=[cron('RDK Office Roll-call', 'Senin & Kamis 07:00 — audit buffer packaging'), ev('Permintaan PO dari Mas Tukijo / Pak Marno')],
   tugas=['Cek stok & riwayat harga vendor', 'Susun draft PO', 'Negosiasi harga supplier'],
   serah=[to('general-manager', 'Draft PO untuk approval', 'SOP-01'), to('bendahara', 'Draft PO (propose jurnal)')],
   eskalasi=[esc('general-manager', 'Harga naik > 15% / supplier baru'), esc('risk-compliance', 'Supplier telat + stok kritis')], sop=['SOP-01']),
 'cs-order': dict(meja='M3', jabatan='CS Order Taker', atasan='general-manager', pengawas='risk-compliance', uang=False, butuh_tony=False,
   skills=['rdk-role-cs-order'], sistem=['wms'],
   pemicu=[ev('Pertanyaan / inquiry pelanggan')],
   tugas=['Jawab status pesanan dari WMS', 'Catat inquiry B2B'],
   serah=[to('admin-kantor', 'Inquiry → draft penawaran', 'SOP-03')],
   eskalasi=[esc('cs-komplain', 'Pelanggan marah / komplain'), esc('ekspedisi-tracker', 'Telat > 3 hari'), esc('risk-compliance', 'Batal order on_packing+')], sop=['SOP-03']),
 'cs-komplain': dict(meja='M3', jabatan='CS Komplain', atasan='general-manager', pengawas='risk-compliance', uang=True, butuh_tony=False,
   skills=['rdk-role-cs-komplain'], sistem=['wms'],
   pemicu=[ev('Komplain pelanggan masuk')],
   tugas=['Kumpulkan bukti (foto, resi, batch)', 'Cocokkan dengan data WMS', 'Kategorikan komplain'],
   serah=[to('quality-control', 'Investigasi komplain', 'SOP-04')],
   eskalasi=[esc('risk-compliance', 'Refund / kompensasi uang'), esc('general-manager', 'Komplain berulang > 2x'), esc('quality-control', '> 3 komplain produk sama / 7 hari')], sop=['SOP-04']),
 'sosmed-ads': dict(meja='M3', jabatan='Social Media & Ads', atasan='general-manager', pengawas='risk-compliance', uang=True, butuh_tony=False,
   skills=['rdk-role-sosmed-ads'], sistem=[],
   pemicu=[ev('Brief produk dari Pak Supono')],
   tugas=['Kelola campaign FB/TikTok/Shopee Ads', 'Laporan ROAS mingguan'],
   serah=[to('general-manager', 'Laporan performa iklan'), to('admin-kantor', 'Inquiry dari iklan', 'SOP-03')],
   eskalasi=[esc('general-manager', 'Budget habis / ROAS < 1 selama 7 hari')], sop=['SOP-03']),
 'checker-packing': dict(meja='M4', jabatan='Checker Packing & Gudang', atasan='general-manager', pengawas='risk-compliance', uang=False, butuh_tony=False,
   skills=['rdk-role-checker-packing'], sistem=['wms', 'discord'],
   pemicu=[cron('RDK Office Roll-call', '07:00 harian — audit antrean packing'), ev('Batch lolos QC')],
   tugas=['Validasi scan resi_in → on_packing → stock_out', 'Catat mutasi non-Shopee', 'Opname EOD 17:00+'],
   serah=[to('admin-kantor', 'Packing B2B selesai → surat jalan', 'SOP-02')],
   eskalasi=[esc('risk-compliance', 'Resi tidak dikenal 3x / cancel PENDING saat packing'), esc('cs-order', 'Cancel PENDING saat packing')], sop=['SOP-02', 'SOP-05']),
 'ekspedisi-tracker': dict(meja='M4', jabatan='Ekspedisi & Tracking', atasan='general-manager', pengawas='risk-compliance', uang=False, butuh_tony=False,
   skills=['rdk-role-ekspedisi-tracker'], sistem=['wms', 'shopee', 'discord'],
   pemicu=[cron('RDK Office Roll-call', '07:00 harian — cek order stuck'), ev('Surat jalan terbit')],
   tugas=['Deteksi order stock_out > 3 hari', 'Ringkasan per kurir', 'Terima fisik retur'],
   serah=[to('cs-komplain', 'Komplain pengiriman')],
   eskalasi=[esc('risk-compliance', 'stock_out > 7 hari'), esc('checker-packing', 'Resi tak terlacak')], sop=['SOP-02', 'SOP-04']),
 'data-entry': dict(meja='M4', jabatan='Data Entry Harian', atasan='admin-produksi', pengawas='risk-compliance', uang=True, butuh_tony=False,
   skills=['rdk-role-data-entry', 'rdk-paper-intake'], sistem=['wms', 'discord'],
   pemicu=[cron('Reminder Kertas Produksi', '17:00–20:00 tiap 10 menit (Sen–Sab)'), cron('RDK Office Closing', '21:00 harian — cek input produksi')],
   tugas=['Digitalisasi kertas/nota ke JSON terstruktur', 'Validasi angka & cross-check nominal'],
   serah=[to('bendahara', 'Nota terstruktur → jurnal'), to('admin-produksi', 'Catatan produksi → HPP / yield')],
   eskalasi=[esc('bendahara', 'Nominal transfer ≠ nota'), esc('risk-compliance', 'Dokumen mencurigakan')], sop=[]),
 'maintenance': dict(meja='M4', jabatan='Maintenance Aset', atasan='general-manager', pengawas='risk-compliance', uang=True, butuh_tony=False,
   skills=['rdk-role-maintenance'], sistem=[],
   pemicu=[cron('RDK Office Closing', 'Sabtu 21:00 — checklist mesin'), ev('Laporan kerusakan operator')],
   tugas=['Servis preventif bulanan', 'Diagnosa kerusakan', 'Log biaya maintenance'],
   serah=[to('procurement', 'Permintaan PO sparepart', 'SOP-01')],
   eskalasi=[esc('general-manager', 'Mesin kritis mati / biaya > Rp 1 juta'), esc('admin-produksi', 'Jadwal produksi terdampak')], sop=['SOP-01']),
 'admin-kantor': dict(meja='M4', jabatan='Admin Kantor & Dokumen', atasan='general-manager', pengawas='risk-compliance', uang=True, butuh_tony=False,
   skills=['rdk-role-admin-kantor'], sistem=['docgen', 'discord'],
   pemicu=[cron('RDK Office Roll-call', 'Selasa & Jumat 07:00 — audit register surat'), ev('Approval PO / kontrak / packing B2B selesai')],
   tugas=['Terbitkan 7 dokumen resmi (INV, PRQ, PO, PI, CI, SJ)', 'Jaga urutan nomor surat'],
   serah=[to('bendahara', 'PO resmi terbit', 'SOP-01'), to('general-manager', 'Draft penawaran untuk review', 'SOP-03'), to('ekspedisi-tracker', 'Surat jalan terbit', 'SOP-02')],
   eskalasi=[esc('general-manager', 'Dokumen di luar batas kewenangan nilai')], sop=['SOP-01', 'SOP-02', 'SOP-03', 'SOP-04', 'SOP-05']),
 'editor-market': dict(meja='M3', jabatan='Editor Market & Konten', atasan='general-manager', pengawas='tony', uang=False, butuh_tony=False,
   skills=['rdk-role-editor-market'], sistem=['cbs-web', 'discord'],
   pemicu=[cron('Mbak Laras — Blog Writer Otonom', 'Senin 08:00'), cron('RDK Market Intel Weekly', 'Senin 09:30 — market brief')],
   tugas=['Radar tren & scoring topik', 'Tulis artikel B2B', 'Build gate + deploy cbs-web'],
   serah=[to('sosmed-organik', 'Artikel baru → bahan post'), to('cs-order', 'Lead dari form blog')],
   eskalasi=[esc('general-manager', 'Regulasi impor berisiko blokir'), esc('tony', 'Regulasi impor berisiko blokir')], sop=[]),
 'market-intel': dict(meja='M5', jabatan='Market Intelligence', atasan='general-manager', pengawas='tony', uang=True, butuh_tony=False,
   skills=['rdk-role-market-intel'], sistem=['discord'],
   pemicu=[cron('RDK Market Intel Weekly', 'Senin 09:30')],
   tugas=['Pantau harga pasar HS 5305.00', 'Hitung margin implisit vs HPP', 'Delta pekan-ke-pekan'],
   serah=[to('editor-market', 'Radar harga → bahan konten'), to('sosmed-organik', 'Radar tren')],
   eskalasi=[esc('tony', 'Harga turun > 10% seminggu / sumber mati 2 minggu')], sop=[]),
 'market-potential': dict(meja='M5', jabatan='Market Potential (Lead Ekspor)', atasan='general-manager', pengawas='tony', uang=False, butuh_tony=False,
   skills=['rdk-role-market-potential'], sistem=['discord'],
   pemicu=[cron('Pak Hartono — Riset Harian Lead Ekspor', '04:00 Sen–Jum (jika SOURCED < 15)'), cron('RDK Market Intel Weekly', 'Senin 09:30 pekan genap')],
   tugas=['Cari importir/distributor 10–100 MT/bulan', 'Arsip riset lead'],
   serah=[to('leads-approach', 'Lead SOURCED → outreach')],
   eskalasi=[esc('tony', 'Peluang > 500 MT/bulan'), esc('regulasi-ekspor', 'Regulasi baru di pasar tujuan')], sop=[]),
 'regulasi-ekspor': dict(meja='M5', jabatan='Regulasi Ekspor', atasan='general-manager', pengawas='tony', uang=False, butuh_tony=False,
   skills=['rdk-role-regulasi-ekspor'], sistem=['discord'],
   pemicu=[cron('RDK Market Monthly Audit', 'Tanggal 1, 10:30')],
   tugas=['Audit regulasi RI & negara tujuan', 'Alert perubahan KRITIS'],
   serah=[to('leads-approach', 'Jawaban regulasi untuk prospek')],
   eskalasi=[esc('tony', 'Kebijakan KRITIS berlaku < 60 hari')], sop=[]),
 'seo-organic': dict(meja='M3', jabatan='SEO Organik', atasan='general-manager', pengawas='tony', uang=False, butuh_tony=True,
   skills=['rdk-role-seo-organic'], sistem=['cbs-web', 'discord'],
   pemicu=[cron('RDK Market Monthly Audit', 'Tanggal 1, 10:30')],
   tugas=['Audit SEO teknis', 'Riset kata kunci → brief', 'Susun backlog backlink'],
   serah=[to('editor-market', 'Brief konten dari riset kata kunci'), to('tony', 'Backlink siap kirim')],
   eskalasi=[esc('tony', 'Peringkat inti jatuh > 10 posisi')], sop=[]),
 'leads-approach': dict(meja='M3', jabatan='Leads Approach (Outreach Ekspor)', atasan='general-manager', pengawas='tony', uang=True, butuh_tony=True,
   skills=['rdk-role-leads-approach'], sistem=['resend', 'discord'],
   pemicu=[cron('Pak Sutejo — Pengajuan Draf Coldreach Harian', '08:00 Sen–Jum')],
   tugas=['Ambil 5 lead SOURCED', 'Cek pricelist resmi', 'Riset & draf email personal'],
   serah=[to('tony', 'Draf email untuk approval'), to('cs-order', 'Prospek deal')],
   eskalasi=[esc('tony', 'Budget di antara HPP & baseline / > 500 MT'), esc('regulasi-ekspor', 'Pertanyaan phytosanitary')], sop=[]),
 'desain-visual': dict(meja='M3', jabatan='Desain Visual', atasan='general-manager', pengawas='tony', uang=False, butuh_tony=False,
   skills=['rdk-role-desain-visual'], sistem=[],
   pemicu=[ev('Brief dari Mbak Sulastri / Pak Sutejo')],
   tugas=['Render aset berbasis data', 'Olah foto produksi', 'Revisi maks 3 putaran'],
   serah=[to('sosmed-organik', 'Aset sosmed untuk dinilai'), to('leads-approach', 'Lampiran email untuk dinilai')],
   eskalasi=[esc('tony', 'Revisi > 3 putaran / klaim tak terbukti')], sop=[]),
 'sosmed-organik': dict(meja='M3', jabatan='Sosmed Organik', atasan='general-manager', pengawas='tony', uang=False, butuh_tony=True,
   skills=['rdk-role-sosmed-organik'], sistem=[],
   pemicu=[ev('Artikel baru Mbak Laras / radar tren')],
   tugas=['Kalender posting', 'Draf per platform', 'Gate pra-publish (dedup, kuota, klaim)'],
   serah=[to('desain-visual', 'Brief visual'), to('tony', 'Draf post untuk approval'), to('cs-order', 'Permintaan penawaran dari komentar'), to('leads-approach', 'Prospek serius')],
   eskalasi=[esc('tony', 'Komentar negatif / token kedaluwarsa'), esc('regulasi-ekspor', 'Isu regulasi di komentar')], sop=[]),
}

def main():
    seen = set()
    for path in sorted(ROLES.glob('role-*.md')):
        text = path.read_text()
        m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
        fm = yaml.safe_load(m.group(1))
        key = fm['role']; seen.add(key)
        w = {'runtime': 'rdk-agent', **W[key]}
        head = re.sub(r'\nworkflow:\n(?:[ \-].*\n?)*', '\n', m.group(1) + '\n').rstrip('\n')
        block = yaml.safe_dump({'workflow': w}, allow_unicode=True, sort_keys=False, width=200).rstrip('\n')
        path.write_text(f'---\n{head}\n{block}\n---\n' + text[m.end():])
    missing = set(W) - seen
    assert not missing, missing
    print('seeded', len(seen))

if __name__ == '__main__':
    main()
