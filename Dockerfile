FROM nodered/node-red:3.0.2-18

# Install InfluxDB nodes for Node-RED
RUN npm install --no-update-notifier --no-fund node-red-contrib-influxdb
