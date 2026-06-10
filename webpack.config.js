/*
 * Copyright (c) 2025-2026 RealEye sp. z o.o.
 * SPDX-License-Identifier: AGPL-3.0-or-later OR LicenseRef-RealEye-Commercial
 */

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');
const packageJson = require('./package.json');

const resolvePort = (value, fallback) => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

// Base path for GitHub Pages project sites (e.g., /repo-name).
// Override with REPO_BASE_PATH env var (e.g., in CI).
const repoBasePath = process.env.REPO_BASE_PATH || '/webcam-eyetracker-light-open';

module.exports = (env, argv) => {
    const publicPath = argv.mode === 'production'
        ? repoBasePath + '/'
        : '/';

    return {
    entry: './apps/demo_app/index.tsx',
    output: {
        path: path.resolve(__dirname, 'dist/demo'),
        filename: 'bundle.[contenthash].js',
        publicPath: publicPath,
        clean: true,
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        alias: {
            '@lib': path.resolve(__dirname, 'lib'),
            '@demo': path.resolve(__dirname, 'apps/demo_app'),
            
        },
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './apps/demo_app/index.html',
            title: 'RealEye Webcam EyeTracker Light Open Demo',
            // Inject <base> tag for GitHub Pages project sites
            base: argv.mode === 'production' ? repoBasePath + '/' : '/',
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'public',
                    to: '.',
                },
                {
                    from: 'node_modules/@mediapipe/tasks-vision/wasm',
                    to: 'wasm',
                },
            ],
        }),
        // Set __webpack_public_path__ at runtime for dynamic asset loading
        new webpack.DefinePlugin({
            '__WEBPACK_PUBLIC_PATH__': JSON.stringify(publicPath),
            '__APP_VERSION__': JSON.stringify(packageJson.version),
        }),
    ],
    devServer: {
        static: [
            {
                directory: path.join(__dirname, 'public'),
                publicPath: publicPath,
            },
            {
                directory: path.join(__dirname, 'node_modules/@mediapipe/tasks-vision/wasm'),
                publicPath: publicPath + 'wasm',
            },
        ],
        devMiddleware: {
            publicPath: publicPath,
        },
        port: resolvePort(process.env.REIO_WEBCAM_ET_LIGHT_PORT || process.env.PORT, 8089),
        hot: process.env.PW_TEST !== '1',
        liveReload: process.env.PW_TEST !== '1',
        // Don't automatically open the system browser during automated test runs
        // or when running in CI. Tests and developers can opt-in to opening the demo
        // by setting REIO_OPEN_BROWSER=1 in their environment.
        open: process.env.REIO_OPEN_BROWSER === '1' ? publicPath : false,
            client: {
                overlay: false,
            },
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },
    },
    devtool: argv.mode === 'production' ? false : 'source-map',
};
};
