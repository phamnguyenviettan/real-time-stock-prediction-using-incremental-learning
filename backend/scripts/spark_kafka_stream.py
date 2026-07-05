import os
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, from_json, to_json, struct
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, IntegerType

def main():
    # Initialize Spark Session connecting to Master Node in Docker
    spark = SparkSession.builder \
        .appName("SparkStockPredictionsStream") \
        .master("spark://spark-master:7077") \
        .getOrCreate()

    # Set log level to reduce console noise
    spark.sparkContext.setLogLevel("WARN")

    print("[Spark Stream] Đã kết nối thành công đến Spark Master! Đang lắng nghe từ Kafka...")

    # Read streaming data from Kafka topic 'stock-predictions' (raw data)
    df = spark.readStream \
        .format("kafka") \
        .option("kafka.bootstrap.servers", "kafka:29092") \
        .option("subscribe", "stock-predictions") \
        .option("startingOffsets", "latest") \
        .load()

    # Define message payload schema
    schema = StructType([
        StructField("tick", IntegerType(), True),
        StructField("datetime", StringType(), True),
        StructField("ticker", StringType(), True),
        StructField("ref_price", DoubleType(), True),
        StructField("actual_price", DoubleType(), True),
        StructField("predicted_price", DoubleType(), True),
        StructField("loss", DoubleType(), True)
    ])

    # Convert binary values to JSON string and parse schema fields
    parsed_df = df.selectExpr("CAST(value AS STRING) as json_val") \
        .select(from_json(col("json_val"), schema).alias("data")) \
        .select("data.*")

    # Filter out empty/handshake messages
    filtered_df = parsed_df.filter(col("ticker").isNotNull())

    # 1. Write streams output to Spark stdout console for debugging
    query_console = filtered_df.writeStream \
        .outputMode("append") \
        .format("console") \
        .start()

    # 2. Write streams output back to Kafka topic 'spark-processed-predictions' (processed data)
    # Add a flag/field 'spark_processed' to prove that the data has indeed passed through Spark
    processed_df = filtered_df.withColumn("spark_processed", col("tick") * 0 + 1)

    kafka_output_df = processed_df.selectExpr("CAST(tick AS STRING) AS key", "to_json(struct(*)) AS value")

    query_kafka = kafka_output_df.writeStream \
        .format("kafka") \
        .option("kafka.bootstrap.servers", "kafka:29092") \
        .option("topic", "spark-processed-predictions") \
        .option("checkpointLocation", "/tmp/spark_checkpoint_kafka") \
        .start()

    # Await both terminations
    query_console.awaitTermination()
    query_kafka.awaitTermination()

if __name__ == "__main__":
    main()
