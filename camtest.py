import cv2

cap = cv2.VideoCapture(0)

while 1:
    ret, frame = cap.read()

    if not ret: break

    cv2.imshow("CAM", frame)

    if cv2.waitKey(1) & 0xFF == ord('q'): break

cap.release()
cv2.destroyAllWindows()
