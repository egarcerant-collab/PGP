import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actualizarGlosa, descuentoGuardado, calcularGlosa, glosaGuardada, contenidoGlosas, resolverGlosa } from '../src/lib/glosa.ts';

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

test('reabrir JSON sin visitar la matriz conserva monto y todos los comentarios del acta', () => {
  const rows = [{ CUPS: '890201', Cantidad_Ejecutada: 10, Valor_Unitario: 5215847, Valor_Ejecutado: 52158470 }];
  const audit = JSON.parse(JSON.stringify({ adjustedQuantities: { '890201': 5 }, comments: { '890201': 'Atenciones sin soporte.\nVerificación pendiente.', '903841': 'Observación adicional' } }));
  const total = calcularGlosa(rows, audit.adjustedQuantities);
  assert.equal(total, 26079235);
  const saved = actualizarGlosa(informe, total);
  saved.pdf_data.ajustesGlosa = audit;
  const reopened = JSON.parse(JSON.stringify(saved));
  assert.equal(glosaGuardada(reopened), total);
  const content = contenidoGlosas(glosaGuardada(reopened), reopened.pdf_data.ajustesGlosa.comments);
  assert.ok(content.some(item => item.text.includes('CUPS 890201: Atenciones sin soporte.\nVerificación pendiente.')));
  assert.ok(content.some(item => item.text.includes('CUPS 903841: Observación adicional')));
  assert.equal(calcularGlosa(rows, { '890201': 10 }), 0);
});

test('columna de glosa distingue subejecución, cero explícito y datos ausentes', () => {
  assert.equal(glosaGuardada({ ...informe, descontar: 26079235 }), 26079235);
  assert.equal(glosaGuardada({ totalEjecutado: 80, descontar: 15, pdfData: { minPeriodo: 90 } }), 5);
  assert.equal(glosaGuardada({ descontar: 50, pdfData: { glosaAuditoria: 0 } }), 0);
  assert.equal(glosaGuardada({}), null);
  assert.deepEqual(contenidoGlosas(0, {}), []);
});

test('restaurar glosa sin detalle no revive una glosa eliminada en la matriz', () => {
  assert.equal(resolverGlosa(0, true, 26079235), 0);
  assert.equal(resolverGlosa(0, false, 26079235), 26079235);
  assert.equal(resolverGlosa(100, true, 26079235), 100);
});
