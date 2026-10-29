import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as glosa from '../src/lib/glosa.ts';

function fixture() {
  const files = new Map();
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const drive = {
    ROOT_FOLDER_ID: 'root', getDrive: () => ({}), getSubfolder: async () => 'auditorias',
    readJson: async (_, folder, name) => clone(files.get(`${folder}/${name}`) ?? null),
    writeJson: async (_, folder, name, value) => files.set(`${folder}/${name}`, clone(value)),
  };
  files.set('root/informes.json', [{ numero: '077', prestador: 'IPS DE PRUEBA', periodo: 'JULIO', contrato: 'CONTRATO-PRUEBA', nt_periodo: 293511721.17, total_ejecutado: 358861216, reconocer: 22714092.67, descontar: 0, pdf_data: { minPeriodo: 256445206.9, ntPeriodo: 293511721.17 } }]);
  function route(name) {
    const source = readFileSync(new URL(`../src/app/api/${name}/route.ts`, import.meta.url), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    vm.runInNewContext(output, { exports, Request, Response, URL, crypto: globalThis.crypto, console,
      require(id) {
        if (id === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) } };
        if (id === '@/lib/gdrive') return drive;
        if (id === '@/lib/glosa') return glosa;
        if (id === '@/lib/get-current-user') return { getCurrentUser: async () => ({ id: 'test', nombre: 'Auditor prueba', rol: 'admin' }) };
        throw new Error(`Unexpected dependency: ${id}`);
      },
    });
    return exports;
  }
  return { files, route };
}

test('guardar auditoría sincroniza acta y reapertura JSON con glosa y comentarios', async () => {
  const { files, route } = fixture();
  const auditData = { glosaAuditoria: 26079235, adjustedQuantities: { C1: 5 }, comments: { C1: 'Sin soporte\nRevisión pendiente' }, selectedRows: {}, selectedPrestador: { PRESTADOR: 'IPS DE PRUEBA', CONTRATO: 'CONTRATO-PRUEBA' } };
  const response = await route('save-audit').POST(new Request('http://test/api/save-audit', { method: 'POST', body: JSON.stringify({ auditData, prestadorName: 'IPS DE PRUEBA', month: 'julio' }) }));
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.warning, null);
  const informe = files.get('root/informes.json')[0];
  assert.equal(informe.descontar, 26079235);
  assert.equal(informe.pdf_data.ajustesGlosa.comments.C1, auditData.comments.C1);
  const reopened = await (await route('load-audit').GET(new Request(`http://test/api/load-audit?id=${saved.id}`))).json();
  assert.equal(reopened.auditData.glosaAuditoria, 26079235);
  assert.equal(reopened.auditData.comments.C1, auditData.comments.C1);
});

test('guardar en registro conserva snapshot y otro usuario lo recupera al consultar', async () => {
  const { route } = fixture();
  const response = await route('informes').POST(new Request('http://test/api/informes', { method: 'POST', body: JSON.stringify({ prestador: 'IPS DE PRUEBA', periodo: 'JULIO', contrato: 'CONTRATO-PRUEBA', descontar: 26079235, pdfData: { glosaAuditoria: 26079235, ajustesGlosa: { comments: { C1: 'Comentario guardado' }, adjustedQuantities: { C1: 5 } } } }) }));
  assert.equal(response.status, 200);
  const result = await (await route('informes').GET(new Request('http://test/api/informes'))).json();
  assert.equal(result.informes[0].numero, '077');
  assert.equal(result.informes[0].pdfData.glosaAuditoria, 26079235);
  assert.equal(result.informes[0].pdfData.ajustesGlosa.comments.C1, 'Comentario guardado');
});
