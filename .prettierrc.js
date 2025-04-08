module.exports = {
  importOrder: ['^@/(.*)$', '^\.\.\/', '^\.\/'],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  plugins: [require.resolve('@trivago/prettier-plugin-sort-imports')],
  singleQuote: true,
};
