import {ScssModulesPlugin} from "esbuild-scss-modules-plugin";

export default {
  plugins: [
    ScssModulesPlugin({
      inject: true,
    }),
  ],
}
