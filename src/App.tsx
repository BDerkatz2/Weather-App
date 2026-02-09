import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import './App.css'

type WeatherData = {
  name: string
  dt: number
  timezone: number
  visibility: number
  coord: {
    lat: number
    lon: number
  }
  sys: {
    country: string
  }
  weather: Array<{
    main: string
    description: string
  }>
  main: {
    temp: number
    feels_like: number
    humidity: number
  }
  wind: {
    speed: number
  }
}

type WeatherRequest = {
  city?: string
  lat?: number
  lon?: number
}

type WeeklyForecastDay = {
  date: string
  code: number
  tempMax: number
  tempMin: number
  uvMax?: number
  sunrise?: string
  sunset?: string
}

const emojiByCondition: Record<string, string> = {
  Clear: '☀️',
  Clouds: '☁️',
  Rain: '🌧️',
  Drizzle: '🌦️',
  Thunderstorm: '⛈️',
  Snow: '❄️',
  Mist: '🌫️',
  Smoke: '🌫️',
  Haze: '🌫️',
  Fog: '🌫️',
  Sand: '🌬️',
  Dust: '🌬️',
  Ash: '🌋',
  Squall: '🌬️',
  Tornado: '🌪️',
}

const imperialLocales = new Set(['en-US', 'en-LR', 'en-MM'])

const getDefaultUnits = () =>
  imperialLocales.has(navigator.language) ? 'imperial' : 'metric'

const formatTime = (unixSeconds: number, timezoneOffset: number) => {
  const localDate = new Date((unixSeconds + timezoneOffset) * 1000)
  return localDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatVisibility = (visibility: number, units: 'metric' | 'imperial') => {
  if (units === 'imperial') {
    const miles = visibility / 1609.34
    return `${miles.toFixed(1)} mi`
  }
  const km = visibility / 1000
  return `${km.toFixed(1)} km`
}

const formatDayLabel = (dateString: string) =>
  new Date(dateString).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

const formatShortTime = (dateString: string) =>
  new Date(dateString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

const getWeeklySummary = (code: number) => {
  if (code === 0) return { label: 'Clear', emoji: '☀️' }
  if (code >= 1 && code <= 3) return { label: 'Clouds', emoji: '⛅' }
  if (code === 45 || code === 48) return { label: 'Fog', emoji: '🌫️' }
  if (code >= 51 && code <= 55) return { label: 'Drizzle', emoji: '🌦️' }
  if (code >= 61 && code <= 67) return { label: 'Rain', emoji: '🌧️' }
  if (code >= 71 && code <= 77) return { label: 'Snow', emoji: '❄️' }
  if (code >= 80 && code <= 82) return { label: 'Showers', emoji: '🌦️' }
  if (code === 85 || code === 86) return { label: 'Snow', emoji: '🌨️' }
  if (code >= 95) return { label: 'Storm', emoji: '⛈️' }
  return { label: 'Clear', emoji: '✨' }
}

const Detail = ({ label, value }: { label: string; value: string }) => (
  <div className="detail">
    <span className="detail-label">{label}</span>
    <span className="detail-value">{value}</span>
  </div>
)

const EmptyState = () => (
  <div className="empty-state">
    <h2>Find your forecast</h2>
    <p>Search any city or use your location.</p>
  </div>
)

const LoadingCard = () => (
  <div className="weather-card skeleton">
    <div className="skeleton-line wide" />
    <div className="skeleton-line" />
    <div className="skeleton-grid">
      <div className="skeleton-line" />
      <div className="skeleton-line" />
      <div className="skeleton-line" />
      <div className="skeleton-line" />
    </div>
  </div>
)

function App() {
  const apiKey = import.meta.env.VITE_OPENWEATHER_API_KEY as string | undefined
  const [query, setQuery] = useState('')
  const [units, setUnits] = useState<'metric' | 'imperial'>(() =>
    typeof navigator === 'undefined' ? 'metric' : getDefaultUnits(),
  )
  const [data, setData] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [weekly, setWeekly] = useState<WeeklyForecastDay[] | null>(null)
  const [weeklyLoading, setWeeklyLoading] = useState(false)
  const [weeklyError, setWeeklyError] = useState('')
  const lastRequest = useRef<WeatherRequest | null>(null)
  const shellRef = useRef<HTMLDivElement | null>(null)
  const rippleRef = useRef<HTMLDivElement | null>(null)

  const temperatureLabel = units === 'metric' ? 'C' : 'F'
  const windLabel = units === 'metric' ? 'm/s' : 'mph'

  const fetchWeather = useCallback(
    async (request: WeatherRequest) => {
      if (!apiKey) {
        setError('Add VITE_OPENWEATHER_API_KEY to a .env file to fetch data.')
        return
      }

      const params = new URLSearchParams({
        appid: apiKey,
        units,
      })

      if (request.city) {
        params.set('q', request.city)
      }

      if (request.lat !== undefined && request.lon !== undefined) {
        params.set('lat', request.lat.toString())
        params.set('lon', request.lon.toString())
      }

      setLoading(true)
      setError('')
      lastRequest.current = request

      try {
        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?${params.toString()}`,
        )

        const body = (await response.json()) as {
          message?: string
        }

        if (!response.ok) {
          throw new Error(body.message || 'Unable to fetch weather right now.')
        }

        setData(body as WeatherData)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
        setData(null)
      } finally {
        setLoading(false)
      }
    },
    [apiKey, units],
  )

  const fetchWeeklyForecast = useCallback(
    async (lat: number, lon: number) => {
      setWeeklyLoading(true)
      setWeeklyError('')

      const params = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lon.toString(),
        daily:
          'weathercode,temperature_2m_max,temperature_2m_min,uv_index_max,sunrise,sunset',
        timezone: 'auto',
        forecast_days: '7',
        temperature_unit: units === 'imperial' ? 'fahrenheit' : 'celsius',
      })

      try {
        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
        )

        if (!response.ok) {
          throw new Error('Unable to fetch the weekly forecast.')
        }

        const body = (await response.json()) as {
          daily?: {
            time?: string[]
            weathercode?: number[]
            temperature_2m_max?: number[]
            temperature_2m_min?: number[]
            uv_index_max?: number[]
            sunrise?: string[]
            sunset?: string[]
          }
        }

        const daily = body.daily
        if (!daily?.time?.length) {
          throw new Error('Weekly forecast data is unavailable.')
        }

        const nextWeek = daily.time.map((date, index) => ({
          date,
          code: daily.weathercode?.[index] ?? 0,
          tempMax: daily.temperature_2m_max?.[index] ?? 0,
          tempMin: daily.temperature_2m_min?.[index] ?? 0,
          uvMax: daily.uv_index_max?.[index],
          sunrise: daily.sunrise?.[index],
          sunset: daily.sunset?.[index],
        }))

        setWeekly(nextWeek)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setWeeklyError(message)
        setWeekly(null)
      } finally {
        setWeeklyLoading(false)
      }
    },
    [units],
  )

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) {
      setError('Enter a city name to search.')
      return
    }
    fetchWeather({ city: trimmed })
  }

  const onUseLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported in this browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        fetchWeather({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        })
      },
      () => {
        setError('Unable to access your location. Check browser permissions.')
      },
    )
  }

  useEffect(() => {
    if (lastRequest.current) {
      fetchWeather(lastRequest.current)
    }
  }, [fetchWeather, units])

  useEffect(() => {
    if (!data?.coord) {
      setWeekly(null)
      return
    }

    fetchWeeklyForecast(data.coord.lat, data.coord.lon)
  }, [data?.coord?.lat, data?.coord?.lon, fetchWeeklyForecast])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) {
      return
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduceMotion.matches) {
      return
    }

    let frame = 0
    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0

    const animate = () => {
      currentX += (targetX - currentX) * 0.3
      currentY += (targetY - currentY) * 0.3
      shell.style.setProperty('--px', currentX.toFixed(2))
      shell.style.setProperty('--py', currentY.toFixed(2))
      frame = window.requestAnimationFrame(animate)
    }

    const onMove = (event: MouseEvent) => {
      const { innerWidth, innerHeight } = window
      targetX = (event.clientX - innerWidth / 2) / 4
      targetY = (event.clientY - innerHeight / 2) / 4
    }

    frame = window.requestAnimationFrame(animate)
    window.addEventListener('mousemove', onMove)

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    const container = rippleRef.current
    if (!container) {
      return
    }

    const onRipple = (event: PointerEvent) => {
      const ripple = document.createElement('span')
      ripple.className = 'ripple'
      const size = Math.max(window.innerWidth, window.innerHeight) * 0.112
      ripple.style.width = `${size}px`
      ripple.style.height = `${size}px`
      ripple.style.left = `${event.clientX - size / 2}px`
      ripple.style.top = `${event.clientY - size / 2}px`
      container.appendChild(ripple)

      ripple.addEventListener('animationend', () => {
        ripple.remove()
      })
    }

    window.addEventListener('pointerdown', onRipple)

    return () => {
      window.removeEventListener('pointerdown', onRipple)
    }
  }, [])

  const condition = data?.weather[0]
  const conditionEmoji = condition ? emojiByCondition[condition.main] || '✨' : ''

  const headline = data
    ? `${data.name}, ${data.sys.country}`
    : 'Weather Pulse'

  const description = data
    ? `${conditionEmoji} ${condition?.description ?? 'Clear sky'}`
    : 'Neon climate snapshots with live updates.'

  const feelsLike = data
    ? `${Math.round(data.main.feels_like)}°${temperatureLabel}`
    : '--'

  const currentTemp = data
    ? `${Math.round(data.main.temp)}°${temperatureLabel}`
    : '--'

  const statusTime = data
    ? formatTime(data.dt, data.timezone)
    : ''

  const toggleUnits = () => {
    setUnits((current) => (current === 'metric' ? 'imperial' : 'metric'))
  }

  const statusBadge = useMemo(
    () => (units === 'metric' ? 'Celsius' : 'Fahrenheit'),
    [units],
  )

  return (
    <div className="app-shell" ref={shellRef}>
      <div className="parallax-bg" aria-hidden="true" />
      <div className="parallax-bg back" aria-hidden="true" />
      <div className="ripple-layer" ref={rippleRef} aria-hidden="true" />
      <header className="hero">
        <div>
          <p className="eyebrow">Live Weather</p>
          <h1>{headline}</h1>
          <p className="subhead">{description}</p>
        </div>
        <div className="unit-controls">
          <span className="chip">Auto by locale</span>
          <button className="chip toggle" type="button" onClick={toggleUnits}>
            {statusBadge}
          </button>
        </div>
      </header>

      <main className="content">
        <form className="search-bar" onSubmit={onSubmit}>
          <input
            type="search"
            placeholder="Search by city (e.g. Seoul)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search by city"
          />
          <button type="submit">Search</button>
          <button type="button" className="secondary" onClick={onUseLocation}>
            Use my location
          </button>
        </form>

        {error ? <div className="error-banner">{error}</div> : null}

        {loading ? (
          <LoadingCard />
        ) : data ? (
          <section className="weather-card">
            <div className="weather-main">
              <div>
                <span className="temp">{currentTemp}</span>
                <p className="feels">Feels like {feelsLike}</p>
              </div>
              <div className="weather-meta">
                <p className="condition">{condition?.main}</p>
                <p className="time">Updated {statusTime}</p>
              </div>
            </div>
            <div className="details-grid">
              <Detail label="Humidity" value={`${data.main.humidity}%`} />
              <Detail label="Wind" value={`${data.wind.speed} ${windLabel}`} />
              <Detail
                label="Visibility"
                value={formatVisibility(data.visibility, units)}
              />
              <Detail label="Sky" value={condition?.description ?? '--'} />
            </div>
          </section>
        ) : (
          <EmptyState />
        )}

        <section className="weekly-forecast">
          <div className="weekly-header">
            <h2>7-day outlook</h2>
            <span className="chip">Open-Meteo</span>
          </div>

          {weeklyLoading ? (
            <div className="forecast-empty">Loading the week ahead...</div>
          ) : weeklyError ? (
            <div className="forecast-empty">{weeklyError}</div>
          ) : weekly ? (
            <>
              <div className="forecast-grid">
                {weekly.map((day) => {
                  const summary = getWeeklySummary(day.code)
                  return (
                    <div key={day.date} className="forecast-day">
                      <span className="day">{formatDayLabel(day.date)}</span>
                      <span className="forecast-emoji" aria-hidden="true">
                        {summary.emoji}
                      </span>
                      <span className="forecast-label">{summary.label}</span>
                      <div className="forecast-temps">
                        <strong>{Math.round(day.tempMax)}°</strong>
                        <span>{Math.round(day.tempMin)}°</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="forecast-extras">
                <div className="forecast-extra">
                  <span className="detail-label">Sunrise</span>
                  <span className="detail-value">
                    {weekly[0]?.sunrise ? formatShortTime(weekly[0].sunrise) : '--'}
                  </span>
                </div>
                <div className="forecast-extra">
                  <span className="detail-label">Sunset</span>
                  <span className="detail-value">
                    {weekly[0]?.sunset ? formatShortTime(weekly[0].sunset) : '--'}
                  </span>
                </div>
                <div className="forecast-extra">
                  <span className="detail-label">UV Max</span>
                  <span className="detail-value">
                    {weekly[0]?.uvMax !== undefined
                      ? weekly[0].uvMax.toFixed(1)
                      : '--'}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="forecast-empty">Search a city to see the week ahead.</div>
          )}

          <p className="forecast-note">Data by Open-Meteo</p>
        </section>
      </main>
    </div>
  )
}

export default App
