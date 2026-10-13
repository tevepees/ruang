# One-shot seeder: injects a BPMN-lite `workflow:` block (lanes = roles, steps = nodes) into each SOP frontmatter.
# ponytail: seeded from the SOP prose once; afterwards the vault is edited by hand. Re-running replaces the block.
import re, sys, yaml, pathlib

VAULT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/root/Projects/second-brain-2/vault')
SOPS = VAULT / '03-projects/ridha-dua-keluarga/sop'

def s(id, role, label, tipe='task', ke=None, uang=False):
    step = {'id': id, 'role': role, 'tipe': tipe, 'label': label}
    if ke: step['ke'] = [k if isinstance(k, dict) else {'id': k} for k in ke]
    if uang: step['uang'] = True
    return step
def g(*pairs): return [{'id': pairs[i], 'syarat': pairs[i + 1]} for i in range(0, len(pairs), 2)]

FLOWS = {
 'SOP-00': [
   s('mulai', 'role-a', 'Role A selesai kerja', 'start', ['buat']),
   s('buat', 'role-a', 'kanban_create tiket Role B (parents = tiket A) + header Discord [A ➔ B]', ke=['cek']),
   s('cek', 'role-b', 'Hasil memenuhi kriteria?', 'gateway', g('lanjut', 'Ya', 'balik', 'Tidak', 'naik', 'Lewat ambang')),
   s('lanjut', 'role-b', 'Kerjakan & estafet ke role berikutnya', ke=['selesai']),
   s('balik', 'role-b', 'kanban_block / request_changes → kembali ke Role A', ke=['buat']),
   s('naik', 'general-manager', 'Eskalasi: biaya > Rp 500rb, reject > 10%, selisih stok > 5%, SLA > 24 jam', ke=['selesai']),
   s('selesai', 'role-b', 'Tiket done', 'end'),
 ],
 'SOP-01': [
   s('mulai', 'procurement', 'Stok di bawah ROP / jadwal belanja mingguan', 'start', ['draft']),
   s('draft', 'procurement', 'Cek stok & harga vendor, susun draft PO', ke=['nilai'], uang=True),
   s('nilai', 'procurement', 'Nilai PO?', 'gateway', g('otonom', '< Rp 500rb', 'gm', 'Rp 500rb – 50jt', 'owner', '> Rp 50jt')),
   s('otonom', 'procurement', 'Otonomi supervisor divisi', ke=['po']),
   s('gm', 'general-manager', 'Validasi harga & likuiditas', ke=['putus'], uang=True),
   s('owner', 'tony', 'Approval owner', ke=['po'], uang=True),
   s('putus', 'general-manager', 'Disetujui?', 'gateway', g('po', 'Ya', 'draft', 'Revisi')),
   s('po', 'admin-kantor', 'Terbitkan PO resmi PO/RDK/YYMM/XXXX', ke=['catat'], uang=True),
   s('catat', 'bendahara', 'Catat komitmen utang, bayar saat barang tiba', ke=['selesai'], uang=True),
   s('selesai', 'bendahara', 'Jurnal kas keluar, tiket done', 'end'),
 ],
 'SOP-02': [
   s('mulai', 'admin-produksi', 'Sesi pressing selesai', 'start', ['catat']),
   s('catat', 'admin-produksi', 'Catat blok, bahan baku, nomor batch; palet karantina', ke=['qc']),
   s('qc', 'quality-control', 'Sampling 5%: EC, moisture, berat', ke=['lolos']),
   s('lolos', 'quality-control', 'Lolos QC?', 'gateway', g('packing', 'Lolos', 'catat', 'Tahan / remill')),
   s('packing', 'checker-packing', 'Wrapping, scan WMS, cetak resi', ke=['b2b']),
   s('b2b', 'checker-packing', 'Pesanan B2B armada luar?', 'gateway', g('sj', 'Ya', 'kirim', 'Shopee')),
   s('sj', 'admin-kantor', 'Terbitkan Surat Jalan SJ/RDK/YYMM/XXXX', ke=['kirim']),
   s('kirim', 'ekspedisi-tracker', 'Serah terima kurir & tracking resi', ke=['selesai']),
   s('selesai', 'ekspedisi-tracker', 'Terkirim, tiket done', 'end'),
 ],
 'SOP-03': [
   s('mulai', 'cs-order', 'Inquiry pelanggan / buyer masuk', 'start', ['tiket']),
   s('tiket', 'cs-order', 'Catat kebutuhan, tiket ke Mbak Rini', ke=['quote']),
   s('quote', 'admin-kantor', 'Draft quotation / PI', ke=['review'], uang=True),
   s('review', 'general-manager', 'Margin & jadwal layak?', 'gateway', g('dp', 'Setuju', 'quote', 'Revisi')),
   s('dp', 'bendahara', 'Verifikasi DP di rekening koran, jurnal uang muka', ke=['spk'], uang=True),
   s('spk', 'admin-produksi', 'SPK produksi aktif (lanjut SOP-02), kunci stok', ke=['dok']),
   s('dok', 'admin-kantor', 'Invoice pelunasan + surat jalan / CI + packing list', ke=['lunas'], uang=True),
   s('lunas', 'bendahara', 'Pelunasan diterima → lampu hijau muat', ke=['selesai'], uang=True),
   s('selesai', 'bendahara', 'Barang dimuat', 'end'),
 ],
 'SOP-04': [
   s('mulai', 'cs-komplain', 'Komplain pelanggan masuk (SLA < 2 jam)', 'start', ['bukti']),
   s('bukti', 'cs-komplain', 'Kumpulkan bukti foto, resi, batch', ke=['investigasi']),
   s('investigasi', 'quality-control', 'Telusuri batch & akar masalah', ke=['sebab']),
   s('sebab', 'quality-control', 'Penyebab?', 'gateway', g('klaim', 'Ekspedisi', 'putus', 'Mutu / packing')),
   s('klaim', 'ekspedisi-tracker', 'Klaim asuransi ekspedisi', ke=['putus']),
   s('putus', 'general-manager', 'Putuskan: ganti barang / refund / kredit', ke=['dok'], uang=True),
   s('dok', 'admin-kantor', 'Nota penerimaan retur', ke=['refund']),
   s('refund', 'bendahara', 'Transfer refund & jurnal 4100-RETUR', ke=['terima'], uang=True),
   s('terima', 'ekspedisi-tracker', 'Terima fisik barang retur', ke=['selesai']),
   s('selesai', 'cs-komplain', 'Kabari pelanggan, komplain ditutup', 'end'),
 ],
 'SOP-05': [
   s('mulai', 'checker-packing', 'Barang keluar gudang', 'start', ['jenis']),
   s('jenis', 'checker-packing', 'Shopee atau non-Shopee?', 'gateway', g('potong', 'Shopee', 'mutasi', 'Non-Shopee')),
   s('potong', 'checker-packing', 'Stok rak terpotong saat scan on_packing', ke=['opname']),
   s('mutasi', 'checker-packing', 'Catat mutasi: sampel / offline / b2b / rusak / retur', ke=['opname']),
   s('opname', 'checker-packing', 'Opname EOD 17:00+: input qty fisik', ke=['selisih']),
   s('selisih', 'bendahara', 'Selisih?', 'gateway', g('shrink', 'Fisik < sistem', 'koreksi', 'Fisik > sistem', 'selesai', 'Cocok')),
   s('shrink', 'bendahara', 'Shrinkage → kerugian / penambah HPP', ke=['selesai'], uang=True),
   s('koreksi', 'admin-produksi', 'Koreksi kurang catat produksi / retur', ke=['selesai']),
   s('selesai', 'bendahara', 'Stok terkunci hari itu', 'end'),
 ],
}

def main():
    done = set()
    for path in sorted(SOPS.glob('SOP-*.md')):
        text = path.read_text()
        m = re.match(r'^---\n(.*?)\n---\n', text, re.S)
        code = yaml.safe_load(m.group(1))['code'].replace('-RDK', '')
        head = re.sub(r'\nworkflow:\n(?:[ \-].*\n?)*', '\n', m.group(1) + '\n').rstrip('\n')
        block = yaml.safe_dump({'workflow': {'langkah': FLOWS[code]}}, allow_unicode=True, sort_keys=False, width=200).rstrip('\n')
        path.write_text(f'---\n{head}\n{block}\n---\n' + text[m.end():])
        done.add(code)
    assert done == set(FLOWS), set(FLOWS) - done
    print('seeded', len(done))

if __name__ == '__main__':
    main()
