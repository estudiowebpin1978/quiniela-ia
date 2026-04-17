export interface Prediccion {
  id: string;
  fecha: string;
  turno: string;
  numeros_2: string[];
  numeros_3?: string[];
  numeros_4?: string[];
  redoblona?: string;
  estado: string;
}

export interface Resultado {
  fecha: string;
  turno: string;
  numeros: string[];
}

export interface Suscripcion {
  id: string;
  email: string;
  estado: "pending" | "active" | "expired";
  fecha_inicio?: string;
  fecha_fin?: string;
}