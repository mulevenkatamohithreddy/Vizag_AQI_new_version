import pandas as pd
import numpy as np
import os
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from xgboost import XGBRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.preprocessing import StandardScaler
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import LSTM, Dense, Dropout
import json
from datetime import timedelta

def fill_missing(df):
    # Forward fill then backward fill for continuous variables
    cols = ['PM2.5', 'PM10', 'NO2', 'SO2', 'CO', 'O3', 'Temperature', 'Humidity', 'Wind_Speed', 'AQI']
    for col in cols:
        df[col] = df[col].interpolate(method='linear').ffill().bfill()
    return df

def create_features(df):
    df['Date'] = pd.to_datetime(df['Date'])
    df['Year'] = df['Date'].dt.year
    df['Month'] = df['Date'].dt.month
    df['Day'] = df['Date'].dt.day
    df['DayOfWeek'] = df['Date'].dt.dayofweek
    # Season: 1: Winter, 2: Summer, 3: Monsoon, 4: Post-monsoon
    df['Season'] = df['Month'].apply(lambda x: 1 if x in [12, 1, 2] else (2 if x in [3, 4, 5] else (3 if x in [6, 7, 8, 9] else 4)))
    return df

def prepare_lstm_data(data, lookback=30):
    X, y = [], []
    for i in range(len(data) - lookback):
        X.append(data[i:(i + lookback)])
        y.append(data[i + lookback])
    return np.array(X), np.array(y)

def train_and_save_models(data_path="data/vizag_historic_aqi.csv", models_dir="models"):
    if not os.path.exists(models_dir):
        os.makedirs(models_dir)

    print("Loading data...")
    df = pd.read_csv(data_path)
    df = fill_missing(df)
    df = create_features(df)
    
    # We will train one generalized model with 'Location' one-hot encoded for tree models.
    df_encoded = pd.get_dummies(df, columns=['Location'])
    
    features = [c for c in df_encoded.columns if c not in ['Date', 'AQI']]
    X = df_encoded[features]
    y = df_encoded['AQI']

    # Train Test Split (80/20)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, shuffle=False)

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    joblib.dump(scaler, os.path.join(models_dir, 'scaler.pkl'))
    
    # Save feature names internally to preserve ordering
    joblib.dump(features, os.path.join(models_dir, 'feature_names.pkl'))

    metrics_report = {}

    # 1. Random Forest
    print("Training Random Forest...")
    rf = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    rf.fit(X_train_scaled, y_train)
    rf_pred = rf.predict(X_test_scaled)
    joblib.dump(rf, os.path.join(models_dir, 'rf_model.pkl'))
    
    metrics_report['RandomForest'] = {
        'RMSE': float(np.sqrt(mean_squared_error(y_test, rf_pred))),
        'MAE': float(mean_absolute_error(y_test, rf_pred)),
        'Accuracy%': float(r2_score(y_test, rf_pred) * 100)
    }

    # 2. XGBoost
    print("Training XGBoost...")
    xgb = XGBRegressor(n_estimators=150, learning_rate=0.1, max_depth=6, random_state=42, n_jobs=-1)
    xgb.fit(X_train_scaled, y_train)
    xgb_pred = xgb.predict(X_test_scaled)
    joblib.dump(xgb, os.path.join(models_dir, 'xgb_model.pkl'))
    
    metrics_report['XGBoost'] = {
        'RMSE': float(np.sqrt(mean_squared_error(y_test, xgb_pred))),
        'MAE': float(mean_absolute_error(y_test, xgb_pred)),
        'Accuracy%': float(r2_score(y_test, xgb_pred) * 100)
    }

    # 3. LSTM (per location for simplicity, or just generalized on aggregated).
    # To keep it memory feasible, we will train an LSTM on the aggregated mean AQI for forecasting the city trend.
    print("Training LSTM for global forecast...")
    global_df = df.groupby('Date')['AQI'].mean().reset_index()
    lstm_data = global_df['AQI'].values
    
    from sklearn.preprocessing import MinMaxScaler
    lstm_scaler = MinMaxScaler(feature_range=(0,1))
    lstm_data_scaled = lstm_scaler.fit_transform(lstm_data.reshape(-1, 1))
    
    lookback = 30
    X_lstm, y_lstm = prepare_lstm_data(lstm_data_scaled, lookback)
    
    X_lstm = np.reshape(X_lstm, (X_lstm.shape[0], X_lstm.shape[1], 1))
    
    split = int(len(X_lstm)*0.8)
    X_train_lstm, X_test_lstm = X_lstm[:split], X_lstm[split:]
    y_train_lstm, y_test_lstm = y_lstm[:split], y_lstm[split:]
    
    model = Sequential()
    model.add(LSTM(50, return_sequences=True, input_shape=(lookback, 1)))
    model.add(LSTM(50))
    model.add(Dense(1))
    model.compile(optimizer='adam', loss='mean_squared_error')
    
    model.fit(X_train_lstm, y_train_lstm, epochs=10, batch_size=64, verbose=1)
    
    # Evaluate LSTM
    lstm_pred_scaled = model.predict(X_test_lstm)
    lstm_pred = lstm_scaler.inverse_transform(lstm_pred_scaled)
    y_test_lstm_inv = lstm_scaler.inverse_transform(y_test_lstm)
    
    metrics_report['LSTM'] = {
        'RMSE': float(np.sqrt(mean_squared_error(y_test_lstm_inv, lstm_pred))),
        'MAE': float(mean_absolute_error(y_test_lstm_inv, lstm_pred)),
        'Accuracy%': float(r2_score(y_test_lstm_inv, lstm_pred) * 100)
    }
    
    model.save(os.path.join(models_dir, 'lstm_model.keras'))
    joblib.dump(lstm_scaler, os.path.join(models_dir, 'lstm_scaler.pkl'))
    
    # Save metrics
    with open(os.path.join(models_dir, 'metrics.json'), 'w') as f:
        json.dump(metrics_report, f, indent=4)
        
    print("Training Complete. Metrics:")
    for model_name, metrics in metrics_report.items():
        print(f"{model_name}: Accuracy: {metrics['Accuracy%']:.2f}%")

    # Generate 10-year generic forecast payload
    generate_forecasts(model, lstm_scaler, global_df, lookback)

def generate_forecasts(model, scaler, df, lookback, future_days=3650):
    print("Generating 10-year forecast...")
    last_block = df['AQI'].values[-lookback:]
    last_block_scaled = scaler.transform(last_block.reshape(-1, 1))
    
    predictions_scaled = []
    current_block = last_block_scaled.reshape(1, lookback, 1)
    
    for _ in range(future_days):
        pred = model.predict(current_block, verbose=0)
        predictions_scaled.append(pred[0, 0])
        # Update current block
        current_block = np.append(current_block[:, 1:, :], [[[pred[0,0]]]], axis=1)
        
    predictions_real = scaler.inverse_transform(np.array(predictions_scaled).reshape(-1, 1))
    
    last_date = df['Date'].iloc[-1]
    future_dates = [pd.to_datetime(last_date) + timedelta(days=i) for i in range(1, future_days+1)]
    
    forecast_df = pd.DataFrame({
        'Date': [d.strftime('%Y-%m-%d') for d in future_dates],
        'AQI_Forecast': predictions_real.flatten()
    })
    
    forecast_df.to_csv('data/vizag_forecast_10yrs.csv', index=False)
    print("Forecast generation complete!")

if __name__ == "__main__":
    train_and_save_models()
