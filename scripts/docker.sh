#!/bin/bash

# Check if an argument is provided
if [ -z "$1" ]; then
    echo "Usage: $0 {build|run|start|bash}"
    exit 1
fi

# Execute the corresponding command based on the argument
case "$1" in
build)
    echo "Building production image..."
    docker build --platform linux/amd64 -t eliza .
    ;;
run)
    running=$(docker ps -q -f name=eliza)
    if [ -n "$running" ]; then
        echo "Container 'eliza' is already running. Stopping it first."
        docker stop eliza
        docker rm eliza
    fi

    BASE_MOUNTS=(
        "characters:/app/characters"
        # ".env:/app/.env"
        "agent:/app/agent"
        # "docs:/app/docs"
        "scripts:/app/scripts"
    )

    PACKAGES=(
        # "adapter-postgres"
        "adapter-sqlite"
        # "adapter-sqljs"
        # "adapter-supabase"
        "client-auto"
        "client-direct"
        # "client-discord"
        # "client-farcaster"
        # "client-telegram"
        "client-twitter"
        "core"
        # "my-plugin"
        "plugin-starknet"
        "plugin-bootstrap"
        # "plugin-image-generation"
        # "plugin-node"
        # "plugin-solana"
        # "plugin-evm"
        # "plugin-tee"
    )

    CMD="docker run --platform linux/amd64 -p 3000:3000 -d"

    # Add base mounts
    for mount in "${BASE_MOUNTS[@]}"; do
        CMD="$CMD -v $(pwd)/$mount"
    done
    # Add package mounts
    for package in "${PACKAGES[@]}"; do
        CMD="$CMD -v $(pwd)/packages/$package/src:/app/packages/$package/src"
    done

    # Add core types mount separately (special case)
    CMD="$CMD -v $(pwd)/packages/core/types:/app/packages/core/types"
    CMD="$CMD --name eliza eliza"

    eval "$CMD"
    ;;
start)
    docker start eliza
    ;;
bash)
    running=$(docker ps -q -f name=eliza)
    if [ -n "$running" ]; then
        docker exec -it eliza bash
    else
        echo "Container 'eliza' is not running. Please start it first."
        exit 1
    fi
    ;;
*)
    echo "Invalid option: $1"
    echo "Usage: $0 {build|run|start|bash}"
    exit 1
    ;;
esac
