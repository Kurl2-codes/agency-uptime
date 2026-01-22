<template>
    <div>
        <form class="my-4" autocomplete="off" @submit.prevent="savePrompt">
            <div class="mb-4">
                <label class="form-label">{{ $t("Maintenance Agent System Prompt") }}</label>
                <textarea
                    v-model="prompt"
                    class="form-control"
                    rows="20"
                    :placeholder="$t('Enter custom system prompt override...')"
                    style="font-family: monospace; font-size: 0.9em;"
                ></textarea>
                <div class="form-text mt-2">
                    {{ $t("Define the behavior for the Maintenance Agent (email scanning and parsing).") }}
                </div>
            </div>

            <div>
                <button class="btn btn-primary" type="submit">
                    {{ $t("Save") }}
                </button>
            </div>
        </form>
    </div>
</template>

<script>
export default {
    data() {
        return {
            prompt: "",
        };
    },
    mounted() {
        this.loadPrompt();
    },
    methods: {
        loadPrompt() {
            this.$root.getSocket().emit("getMaintenancePrompt", (res) => {
                if (res.ok) {
                    this.prompt = res.prompt;
                } else {
                    this.$root.toastError(res.msg);
                }
            });
        },
        savePrompt() {
            this.$root.getSocket().emit("setMaintenancePrompt", this.prompt, (res) => {
                this.$root.toastRes(res);
            });
        },
    },
};
</script>
