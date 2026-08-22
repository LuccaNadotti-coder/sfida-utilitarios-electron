import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Las pruebas de lógica corren en Node, SIN abrir ninguna ventana.
    // Es el requisito heredado de sfida_core.py: la lógica no depende de la
    // interfaz y se tiene que poder verificar sola.
    environment: 'node',
    include: ['pruebas/**/*.test.ts'],
    reporters: ['default'],
  },
});
