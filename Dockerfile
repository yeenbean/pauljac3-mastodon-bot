FROM denoland/deno
WORKDIR /app
ENTRYPOINT ["deno", "run", "--allow-read", "--allow-write", "--allow-env", "--allow-net", "--reload", "src/app.ts"]