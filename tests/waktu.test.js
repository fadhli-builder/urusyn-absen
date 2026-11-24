const { tanggalWIB, menitWIB, hitungStatus } = require('../src/services/waktu');

describe('tanggalWIB', () => {
  test('batas tengah malam WIB: 16:59:59 UTC masih hari yang sama', () => {
    expect(tanggalWIB(new Date('2026-11-24T16:59:59Z'))).toBe('2026-11-24');
  });

  test('batas tengah malam WIB: 17:00:00 UTC sudah hari berikutnya', () => {
    expect(tanggalWIB(new Date('2026-11-24T17:00:00Z'))).toBe('2026-11-25');
  });

  test('UTC memberi tanggal yang salah untuk dini hari WIB (inilah bug zona waktu)', () => {
    const duaPuluhLimaPagi = new Date('2026-11-24T17:30:00Z'); // 00:30 WIB tanggal 25
    expect(duaPuluhLimaPagi.toISOString().slice(0, 10)).toBe('2026-11-24'); // salah menurut WIB
    expect(tanggalWIB(duaPuluhLimaPagi)).toBe('2026-11-25'); // benar
  });
});

describe('menitWIB', () => {
  test('00:30 WIB = 30 menit', () => {
    expect(menitWIB(new Date('2026-11-24T17:30:00Z'))).toBe(30);
  });
  test('07:05 WIB = 425 menit', () => {
    expect(menitWIB(new Date('2026-11-24T00:05:00Z'))).toBe(425);
  });
  test('23:59 WIB = 1439 menit', () => {
    expect(menitWIB(new Date('2026-11-24T16:59:00Z'))).toBe(1439);
  });
});

describe('hitungStatus (jam masuk 07:00, toleransi 10 menit)', () => {
  const status = (utc) => hitungStatus('07:00:00', 10, new Date(utc));

  test('06:59 WIB hadir', () => {
    expect(status('2026-11-23T23:59:00Z')).toBe('hadir');
  });
  test('07:10:30 WIB masih hadir (batas toleransi, detik diabaikan)', () => {
    expect(status('2026-11-24T00:10:30Z')).toBe('hadir');
  });
  test('07:11:00 WIB telat', () => {
    expect(status('2026-11-24T00:11:00Z')).toBe('telat');
  });
  test('12:00 WIB telat', () => {
    expect(status('2026-11-24T05:00:00Z')).toBe('telat');
  });
  test('toleransi kosong dianggap 0 dan format HH:MM diterima', () => {
    expect(hitungStatus('07:00', null, new Date('2026-11-24T00:00:59Z'))).toBe('hadir');
    expect(hitungStatus('07:00', null, new Date('2026-11-24T00:01:00Z'))).toBe('telat');
  });
});
