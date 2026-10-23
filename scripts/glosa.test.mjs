import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actualizarGlosa, descuentoGuardado } from '../src/lib/glosa.ts';

const informe = {
  nt_periodo: 293511721.17, total_ejecutado: 358861216, reconocer: 22714092.67,
  pdf_data: { minPeriodo: 256445206.90, ntPeriodo: 293511721.17 },
};
test('guardar glosa mantiene el total, snapshot y saldo consistentes', () => {
  const result = actualizarGlosa(informe, 26079235);
  assert.equal(result.descontar, 26079235);
  assert.equal(result.pdf_data.descontar, 26079235);
  assert.ok(Math.abs(result.valor_final - 290146578.84) < 0.01);
  assert.equal(actualizarGlosa({ ...informe, ...result }, 26079235).descontar, 26079235);
  assert.equal(actualizarGlosa({ ...informe, ...result }, 0).descontar, 0);
});
test('subejecución se suma una sola vez y se rechazan valores inválidos', () => {
  assert.ok(Math.abs(actualizarGlosa({ ...informe, total_ejecutado: 250000000 }, 100).descontar - 6445306.9) < 0.01);
  for (const invalid of [-1, NaN, Infinity]) assert.throws(() => actualizarGlosa(informe, invalid));
});
test('PDF utiliza descuento del registro, conserva cero y admite snapshots antiguos', () => {
  assert.equal(descuentoGuardado({ descontar: 26079235 }, 0), 26079235);
  assert.equal(descuentoGuardado({ descontar: 0, pdfData: { descontar: 26079235 } }, 100), 0);
  assert.equal(descuentoGuardado({ pdfData: { descontar: 26079235 } }, 0), 26079235);
  assert.equal(descuentoGuardado({}, 100), 100);
});
