const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const { DefinePlugin } = require("webpack");

module.exports = {
    entry: "./src/index.js",
    mode: "development",
    devServer: {
        open: true,
        watchFiles: ["./src/**/*", "../app_package/lib/**/*"],
        port: 8081,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "*"
        },
        static: {
            directory: path.resolve(__dirname, "../docs"),
            serveIndex: true
        },
        historyApiFallback: true,
        client: {
            overlay: true
        },
        devMiddleware: {
            writeToDisk: true
        }
    },
    output: {
        path: path.resolve(__dirname, "../docs"),
        filename: "bundle.js",
        publicPath: "./"
    },
    plugins: [
        new DefinePlugin({
            DEV_BUILD: JSON.stringify(true)
        }),
        new HtmlWebpackPlugin({ title: "Space Pirates made with Babylon.js" }),
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
