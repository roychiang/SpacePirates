const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const { DefinePlugin } = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
    entry: "./src/index.js",
    mode: "production",
    devServer: {
        open: true,
        watchFiles: ["./src/**/*", "../app_package/lib/**/*"]
    },
    output: {
        path: path.resolve(__dirname, "../docs"),
        filename: "bundle.js",
        publicPath: "./"
    },
    plugins: [
        new DefinePlugin({
            DEV_BUILD: JSON.stringify(false)
        }),
        new HtmlWebpackPlugin({
            title: "Space Pirates made with Babylon.js",
            template: path.resolve(__dirname, "src/index.html"),
            hash: true // Append a unique webpack compilation hash to all included scripts and CSS files.
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, "public"),
                    to: path.resolve(__dirname, "../docs"),
                    globOptions: {
                        ignore: ["**/.*"]
                    }
                }
            ]
        })
    ],
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: false,
                        drop_debugger: true
                    }
                }
            })
        ]
    },
    module: {
        rules: [
            {
                test: /\.m?js/,
                resolve: {
                    fullySpecified: false
                }
            }
        ],
    }
};
