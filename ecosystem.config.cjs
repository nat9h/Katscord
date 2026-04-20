module.exports = {
	apps: [
		{
			// script: "voice.js",
			script: "src/index.js",
			name: "katsucord",
			node_args: "--watch --env-file .env",
			watch: false,
			instances: 1,
			exec_mode: "fork",
		},
	],
};
