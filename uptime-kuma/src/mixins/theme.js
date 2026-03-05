export default {

    data() {
        return {
            system: (window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light",
            userTheme: localStorage.theme || "auto",
            userHeartbeatBar: localStorage.heartbeatBarTheme || "normal",
            styleElapsedTime: localStorage.styleElapsedTime || "no-line",
            statusPageTheme: "light",
            forceStatusPageTheme: false,
            path: "",
            mediaQueryList: null,
        };
    },

    mounted() {
        // System Theme Change Listener
        this.mediaQueryList = window.matchMedia("(prefers-color-scheme: dark)");
        if (this.mediaQueryList.addEventListener) {
            this.mediaQueryList.addEventListener("change", this.onSystemThemeChange);
        } else if (this.mediaQueryList.addListener) {
            this.mediaQueryList.addListener(this.onSystemThemeChange);
        }

        // Initialize path from location
        this.path = window.location.pathname;

        document.body.classList.add(this.theme);
        this.updateThemeColorMeta();
    },

    beforeUnmount() {
        if (this.mediaQueryList) {
            if (this.mediaQueryList.removeEventListener) {
                this.mediaQueryList.removeEventListener("change", this.onSystemThemeChange);
            } else if (this.mediaQueryList.removeListener) {
                this.mediaQueryList.removeListener(this.onSystemThemeChange);
            }
        }
    },

    computed: {
        theme() {
            // As entry can be status page now, set forceStatusPageTheme to true to use status page theme
            if (this.forceStatusPageTheme) {
                if (this.statusPageTheme === "auto") {
                    return this.system;
                }
                return this.statusPageTheme;
            }

            // Entry no need dark
            // if (this.path === "" || this.path === "/") {
            //     return "light";
            // }

            if (this.path.startsWith("/status-page") || this.path.startsWith("/status")) {
                if (this.statusPageTheme === "auto") {
                    return this.system;
                }
                return this.statusPageTheme;
            } else {
                if (this.userTheme === "auto") {
                    return this.system;
                }
                return this.userTheme || "light";
            }
        },

        isDark() {
            return this.theme === "dark";
        }
    },

    watch: {
        "$route.fullPath"(path) {
            this.path = path;
        },

        userTheme(to, from) {
            localStorage.theme = to;
        },

        styleElapsedTime(to, from) {
            localStorage.styleElapsedTime = to;
        },

        theme(to, from) {
            if (from) {
                document.body.classList.remove(from);
            }
            if (this.theme) {
                document.body.classList.add(this.theme);
            }
            this.updateThemeColorMeta();
        },

        userHeartbeatBar(to, from) {
            localStorage.heartbeatBarTheme = to;
        },

        heartbeatBarTheme(to, from) {
            document.body.classList.remove(from);
            document.body.classList.add(this.heartbeatBarTheme);
        }
    },

    methods: {
        /**
         * Update the theme color meta tag
         * @returns {void}
         */
        updateThemeColorMeta() {
            const themeColorMeta = document.querySelector("#theme-color");
            if (themeColorMeta) {
                if (this.theme === "dark") {
                    themeColorMeta.setAttribute("content", "#0C1422");
                } else {
                    themeColorMeta.setAttribute("content", "#5cdd8b");
                }
            }
        },

        /**
         * Handle system theme change
         * @param {MediaQueryListEvent} e Event
         * @returns {void}
         */
        onSystemThemeChange(e) {
            this.system = e.matches ? "dark" : "light";
        }
    }
};
