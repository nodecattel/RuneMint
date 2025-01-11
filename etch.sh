#!/bin/bash

# Counter for tracking number of etches
etch_count=0

echo "Starting rune etching loop..."

while true; do
    # Increment counter
    ((etch_count++))
    
    # Print iteration number
    echo "Starting etch iteration #${etch_count}"
    
    # Run the etch command
    bun etch
    
    # Check if the command was successful
    if [ $? -eq 0 ]; then
        echo "Etch #${etch_count} completed successfully"
        echo "-------------------------------------------"
    else
        echo "Etch #${etch_count} failed"
        echo "-------------------------------------------"
    fi
    
    # 30 seconds delay to prevent overwhelming the system
    sleep 30
done
