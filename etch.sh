#!/bin/bash
# Counter for tracking number of etches
etch_count=0
echo "Starting rune etching loop..."
while true; do
    # Increment counter
    ((etch_count++))
    
    # Print iteration number
    echo "Starting etch iteration #${etch_count}"
    
    # Run the etch command and capture its output
    output=$(bun etch 2>&1)
    exit_code=$?
    
    # Print the output
    echo "$output"
    
    # Check if the specific error occurred
    if echo "$output" | grep -q "Out of bounds memory access.*pointFromScalar"; then
        echo "Detected memory access error, restarting immediately..."
        continue  # Skip the sleep and start next iteration
    fi
    
    # Check if the command was successful
    if [ $exit_code -eq 0 ]; then
        echo "Etch #${etch_count} completed successfully"
        echo "-------------------------------------------"
    else
        echo "Etch #${etch_count} failed"
        echo "-------------------------------------------"
    fi
    
    # 60 seconds delay to prevent overwhelming the system
    sleep 60
done
