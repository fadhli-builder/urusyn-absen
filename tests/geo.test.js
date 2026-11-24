const { haversine } = require('../src/services/geo');

describe('haversine', () => {
  test('titik yang sama berjarak 0', () => {
    expect(haversine(-6.2, 106.8, -6.2, 106.8)).toBe(0);
  });

  test('1 derajat lintang sekitar 111.195 meter', () => {
    expect(haversine(0, 0, 1, 0)).toBeCloseTo(111195, 0);
  });

  test('1 derajat bujur di ekuator sekitar 111.195 meter', () => {
    expect(haversine(0, 0, 0, 1)).toBeCloseTo(111195, 0);
  });

  test('simetris: A ke B sama dengan B ke A', () => {
    const ab = haversine(-6.2, 106.8, -6.9, 107.6);
    const ba = haversine(-6.9, 107.6, -6.2, 106.8);
    expect(ab).toBeCloseTo(ba, 6);
  });

  test('London ke Paris sekitar 343 km', () => {
    const m = haversine(51.5074, -0.1278, 48.8566, 2.3522);
    expect(m).toBeGreaterThan(342000);
    expect(m).toBeLessThan(345000);
  });

  test('0,009 derajat lintang sekitar 1 km', () => {
    const m = haversine(-6.2, 106.8, -6.2 + 0.009, 106.8);
    expect(m).toBeGreaterThan(1000);
    expect(m).toBeLessThan(1002);
  });
});
