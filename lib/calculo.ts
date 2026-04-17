export function descomponerNumero(num: string) {
  const s = num.padStart(4, "0");

  return {
    n4: s,
    n3: s.slice(-3),
    n2: s.slice(-2),
  };
}

export function calcularAciertos(
  pred: any,
  resultados: string[]
) {
  let aciertos = { n2: 0, n3: 0, n4: 0 };

  for (const r of resultados) {
    const { n2, n3, n4 } = descomponerNumero(r);

    if (pred.numeros_2?.includes(n2)) aciertos.n2++;
    if (pred.numeros_3?.includes(n3)) aciertos.n3++;
    if (pred.numeros_4?.includes(n4)) aciertos.n4++;
  }

  return aciertos;
}