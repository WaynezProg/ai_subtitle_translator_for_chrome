const path = require('path');
const fs = require('fs');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

// ============================================================================
// Load pre-generated session tokens (from session-helper tool)
// ============================================================================
function loadSessionTokens() {
  const tokens = {
    claude: null,
    chatgpt: null,
  };
  
  // Check for Claude session file
  const claudeSessionPath = path.resolve(__dirname, 'tools/session-helper/claude.session.json');
  if (fs.existsSync(claudeSessionPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(claudeSessionPath, 'utf-8'));
      if (data.credentials?.accessToken) {
        tokens.claude = {
          accessToken: data.credentials.accessToken,
          refreshToken: data.credentials.refreshToken || null,
          expiresAt: data.expiresAt || data.credentials.expiresAt || null,
        };
        console.log('[Webpack] Found Claude session token');
      }
    } catch (e) {
      console.warn('[Webpack] Failed to load Claude session:', e.message);
    }
  }
  
  // Check for ChatGPT session file
  const chatgptSessionPath = path.resolve(__dirname, 'tools/session-helper/chatgpt.session.json');
  if (fs.existsSync(chatgptSessionPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(chatgptSessionPath, 'utf-8'));
      if (data.credentials?.accessToken) {
        tokens.chatgpt = {
          accessToken: data.credentials.accessToken,
          refreshToken: data.credentials.refreshToken || null,
          expiresAt: data.expiresAt || data.credentials.expiresAt || null,
        };
        console.log('[Webpack] Found ChatGPT session token');
      }
    } catch (e) {
      console.warn('[Webpack] Failed to load ChatGPT session:', e.message);
    }
  }
  
  return tokens;
}

const preloadedTokens = loadSessionTokens();

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
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
        use: {
          loader: 'ts-loader',
          options: {
            // Use production tsconfig for prod builds (no declarations)
            configFile: isProduction ? 'tsconfig.build.json' : 'tsconfig.json',
          },
        },
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
    // Inject preloaded session tokens and environment at build time
    new webpack.DefinePlugin({
      '__PRELOADED_CLAUDE_TOKEN__': JSON.stringify(preloadedTokens.claude),
      '__PRELOADED_CHATGPT_TOKEN__': JSON.stringify(preloadedTokens.chatgpt),
      // Enable dead code elimination for production
      'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
    }),
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/popup/index.html', to: 'popup.html' },
        { from: 'src/popup/styles.css', to: 'popup.css', noErrorOnMissing: true },
        { from: 'src/options/index.html', to: 'options.html' },
        { from: 'src/options/styles.css', to: 'options.css' },
        { from: 'src/icons', to: 'icons' },
        { from: 'src/content/styles', to: 'styles' },
        { from: 'rules', to: 'rules' }
      ]
    })
  ],
  optimization: {
    splitChunks: false,
    // Minimize in production
    minimize: isProduction,
    minimizer: isProduction ? [
      new TerserPlugin({
        terserOptions: {
          compress: {
            // Remove console.debug statements in production
            pure_funcs: ['console.debug'],
            // Drop debugger statements
            drop_debugger: true,
            // Remove unused code more aggressively
            passes: 2,
          },
          mangle: {
            // Mangle property names for smaller bundles (safe for this project)
            properties: false,
          },
          format: {
            // Remove comments
            comments: false,
          },
        },
        extractComments: false,
      }),
    ] : [],
  },
  // Use lighter source maps in production (hidden-source-map generates maps but doesn't reference them)
  // In development, use inline-source-map for better debugging
  devtool: isProduction ? 'hidden-source-map' : 'inline-source-map',
  };
};
