const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    background: './src/background/index.ts',
    content: './src/content/index.ts',
    bridge: './src/content/bridge.ts',
    popup: './src/popup/index.ts',
    options: './src/options/index.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@background': path.resolve(__dirname, 'src/background'),
      '@content': path.resolve(__dirname, 'src/content'),
      '@popup': path.resolve(__dirname, 'src/popup'),
      '@options': path.resolve(__dirname, 'src/options')
    }
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/popup/index.html', to: 'popup.html' },
        { from: 'src/popup/styles.css', to: 'popup.css', noErrorOnMissing: true },
        { from: 'src/options/index.html', to: 'options.html' },
        { from: 'src/options/styles.css', to: 'options.css' },
        { from: 'src/icons', to: 'icons' },
        { from: 'src/content/styles', to: 'styles' }
      ]
    })
  ],
  optimization: {
    splitChunks: false
  },
  devtool: 'source-map'
};
