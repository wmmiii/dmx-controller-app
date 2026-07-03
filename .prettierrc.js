module.exports = {
  importOrder: ['^@/(.*)$', '^\.\.\/', '^\.\/'],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  plugins: [
    require.resolve('@trivago/prettier-plugin-sort-imports'),
    'prettier-plugin-organize-imports',
    'prettier-plugin-rational-order',
    'prettier-plugin-glsl',
  ],
  // cssDeclarationSorterOrder: 'alphabetical',
  singleQuote: true,
};
