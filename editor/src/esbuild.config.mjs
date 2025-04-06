import esbuild from 'esbuild';
import CssModulesPlugin from 'esbuild-css-modules-plugin';

esbuild.build({
  plugins: [
    CssModulesPlugin({
      force: true,
      emitDeclarationFile: true,
      localsConvention: 'camelCaseOnly',
      namedExports: true,
      inject: true,
    }),
  ],
});
